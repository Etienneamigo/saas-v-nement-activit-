/**
 * Service de disponibilité pour les réservations natives.
 * Calcule les créneaux disponibles en tenant compte :
 * - des horaires hebdomadaires
 * - des overrides (fermetures ou horaires custom)
 * - des réservations déjà confirmées (capacité restante)
 */

import { prisma } from "@/lib/db"
import type { ReservationSettings, WeeklySchedule, ReservationOverride } from "@prisma/client"

export interface TimeRange {
  start: string // "HH:mm"
  end: string   // "HH:mm"
}

export interface SlotInfo {
  startAt: Date
  endAt: Date
  remainingCapacity: number
  isAvailable: boolean
}

type SettingsWithSchedule = ReservationSettings & {
  weeklySchedule: WeeklySchedule[]
}

/**
 * Génère les créneaux disponibles pour un établissement sur une date donnée.
 */
export async function getAvailableSlots(
  establishmentId: string,
  date: Date
): Promise<SlotInfo[]> {
  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
    include: { weeklySchedule: true },
  })

  if (!settings || !settings.enabled) return []

  // Check booking window
  const now = new Date()
  const maxDate = new Date(now)
  maxDate.setDate(maxDate.getDate() + settings.bookingWindowDays)
  if (date > maxDate) return []

  // Normalise la date au début du jour en Europe/Paris
  const dateStr = formatDateLocal(date, settings.timezone)

  // Vérifier override pour ce jour
  const override = await prisma.reservationOverride.findUnique({
    where: {
      establishmentId_date: {
        establishmentId,
        date: new Date(dateStr),
      },
    },
  })

  if (override?.isClosed) return []

  // Déterminer les ranges d'ouverture pour ce jour
  const dayOfWeek = getDayOfWeekInTz(date, settings.timezone)
  let openRanges: TimeRange[]

  if (override?.customOpenRanges) {
    openRanges = override.customOpenRanges as unknown as TimeRange[]
  } else {
    const schedule = settings.weeklySchedule.find((s) => s.dayOfWeek === dayOfWeek)
    if (!schedule) return [] // Pas d'horaires ce jour
    openRanges = schedule.openRanges as unknown as TimeRange[]
  }

  const capacityPerSlot = override?.customCapacity ?? settings.capacityPerSlot

  // Générer tous les créneaux à partir des ranges
  const allSlots = generateSlots(date, openRanges, settings.slotDurationMinutes, settings.timezone)

  // Filtrer les créneaux dans le passé + minNotice
  const minStartAt = new Date(now.getTime() + settings.minNoticeMinutes * 60 * 1000)
  const futureSlots = allSlots.filter((s) => s.startAt >= minStartAt)

  if (futureSlots.length === 0) return []

  // Compter les réservations confirmées sur ces créneaux
  const slotStartTimes = futureSlots.map((s) => s.startAt)
  const minStart = slotStartTimes[0]
  const maxEnd = futureSlots[futureSlots.length - 1].endAt

  const existingReservations = await prisma.reservation.groupBy({
    by: ["startAt"],
    where: {
      establishmentId,
      status: "CONFIRMED",
      startAt: { gte: minStart, lte: maxEnd },
    },
    _sum: { partySize: true },
  })

  const bookedBySlot = new Map<string, number>()
  for (const r of existingReservations) {
    bookedBySlot.set(r.startAt.toISOString(), r._sum.partySize ?? 0)
  }

  return futureSlots.map((slot) => {
    const booked = bookedBySlot.get(slot.startAt.toISOString()) ?? 0
    const remaining = capacityPerSlot - booked
    return {
      startAt: slot.startAt,
      endAt: slot.endAt,
      remainingCapacity: Math.max(0, remaining),
      isAvailable: remaining > 0,
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSlots(
  date: Date,
  ranges: TimeRange[],
  durationMinutes: number,
  timezone: string
): { startAt: Date; endAt: Date }[] {
  const slots: { startAt: Date; endAt: Date }[] = []
  const dateStr = formatDateLocal(date, timezone)

  for (const range of ranges) {
    let current = parseLocalDateTime(dateStr, range.start, timezone)
    const rangeEnd = parseLocalDateTime(dateStr, range.end, timezone)

    while (current < rangeEnd) {
      const slotEnd = new Date(current.getTime() + durationMinutes * 60 * 1000)
      if (slotEnd > rangeEnd) break
      slots.push({ startAt: new Date(current), endAt: slotEnd })
      current = slotEnd
    }
  }

  return slots
}

/**
 * Retourne la date formatée YYYY-MM-DD dans la timezone de l'établissement.
 */
function formatDateLocal(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("/")
    .reverse()
    .join("-")
}

/**
 * Retourne le jour de la semaine (0=dim…6=sam) dans la timezone donnée.
 */
function getDayOfWeekInTz(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(date)
  const weekday = parts.find((p) => p.type === "weekday")?.value
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return map[weekday ?? "Mon"] ?? 1
}

/**
 * Parse "YYYY-MM-DD" + "HH:mm" en Date UTC en tenant compte de la timezone.
 */
function parseLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  // On utilise Intl pour convertir l'heure locale → UTC
  const [year, month, day] = dateStr.split("-").map(Number)
  const [hour, minute] = timeStr.split(":").map(Number)

  // Créer un Date en UTC puis ajuster avec l'offset de la timezone
  // Technique : utiliser le formatter pour trouver l'offset
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offset = getTzOffsetMinutes(candidate, timezone)
  return new Date(candidate.getTime() - offset * 60 * 1000)
}

function getTzOffsetMinutes(date: Date, timezone: string): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" })
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone })
  const diff = (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  return -diff
}
