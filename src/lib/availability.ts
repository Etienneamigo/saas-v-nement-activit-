/**
 * Service de disponibilité pour les réservations natives.
 * Calcule les créneaux disponibles en tenant compte :
 * - des ReservationSlot persistés (prioritaire si présents)
 * - des horaires hebdomadaires + overrides (fallback si pas de slots persistés)
 * - des réservations déjà confirmées (capacité restante)
 * - des ressources (salles) si multi-ressources activé
 */

import { prisma } from "@/lib/db"
import type { ReservationSettings, WeeklySchedule, ReservationOverride } from "@prisma/client"
import { getEffectiveRules } from "@/lib/resource-rules"

export interface TimeRange {
  start: string // "HH:mm"
  end: string   // "HH:mm"
}

export interface SlotInfo {
  startAt: Date
  endAt: Date
  remainingCapacity: number
  isAvailable: boolean
  slotId?: string             // ID du ReservationSlot persisté si applicable
  resourceId?: string         // ID de la ressource si multi-salles
  resourceName?: string       // Nom de la ressource
  isPersisted?: boolean       // true si slot vient de la table ReservationSlot
}

type SettingsWithSchedule = ReservationSettings & {
  weeklySchedule: WeeklySchedule[]
}

/**
 * Génère les créneaux disponibles pour un établissement sur une date donnée.
 * Priorité : ReservationSlot persistés > génération à la volée depuis WeeklySchedule.
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

  const dateStr = formatDateLocal(date, settings.timezone)
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`)

  // Vérifier si des slots persistés existent pour ce jour
  const persistedSlots = await prisma.reservationSlot.findMany({
    where: {
      establishmentId,
      startAt: { gte: dayStart, lte: dayEnd },
      isActive: true,
    },
    include: { resource: true },
    orderBy: { startAt: "asc" },
  })

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

  if (persistedSlots.length > 0) {
    // ─── Mode slots persistés ────────────────────────────────────────────────
    return getAvailabilityFromPersistedSlots(
      establishmentId,
      persistedSlots,
      settings,
      now
    )
  } else {
    // ─── Mode génération à la volée ──────────────────────────────────────────
    return getAvailabilityFromWeeklySchedule(
      establishmentId,
      date,
      dateStr,
      settings,
      override,
      now
    )
  }
}

// ─── Availability depuis slots persistés ────────────────────────────────────

async function getAvailabilityFromPersistedSlots(
  establishmentId: string,
  slots: Array<{
    id: string
    startAt: Date
    endAt: Date
    capacity: number
    isActive: boolean
    resourceId: string | null
    resource: { id: string; name: string; capacity: number } | null
  }>,
  settings: ReservationSettings,
  now: Date
): Promise<SlotInfo[]> {
  const minStartAt = new Date(now.getTime() + settings.minNoticeMinutes * 60 * 1000)
  const futureSlots = slots.filter((s) => s.startAt >= minStartAt)

  if (futureSlots.length === 0) return []

  // Compter les réservations confirmées par slot
  const slotIds = futureSlots.map((s) => s.id)
  const reservationsBySlot = await prisma.reservation.groupBy({
    by: ["slotId"],
    where: {
      establishmentId,
      status: "CONFIRMED",
      slotId: { in: slotIds },
    },
    _sum: { partySize: true },
  })

  const bookedBySlot = new Map<string, number>()
  for (const r of reservationsBySlot) {
    if (r.slotId) bookedBySlot.set(r.slotId, r._sum.partySize ?? 0)
  }

  // Pour les slots sans resourceId : utiliser la capacité du slot directement
  // Pour les slots avec resourceId : capacité = resource.capacity (ou slot.capacity)
  return futureSlots.map((slot) => {
    const booked = bookedBySlot.get(slot.id) ?? 0
    const capacity = slot.capacity
    const remaining = Math.max(0, capacity - booked)

    return {
      startAt: slot.startAt,
      endAt: slot.endAt,
      remainingCapacity: remaining,
      isAvailable: remaining > 0,
      slotId: slot.id,
      resourceId: slot.resourceId ?? undefined,
      resourceName: slot.resource?.name,
      isPersisted: true,
    }
  })
}

// ─── Availability depuis WeeklySchedule (fallback) ──────────────────────────

async function getAvailabilityFromWeeklySchedule(
  establishmentId: string,
  date: Date,
  dateStr: string,
  settings: ReservationSettings & { weeklySchedule: WeeklySchedule[] },
  override: ReservationOverride | null,
  now: Date
): Promise<SlotInfo[]> {
  const dayOfWeek = getDayOfWeekInTz(date, settings.timezone)
  let openRanges: TimeRange[]

  if (override?.customOpenRanges) {
    openRanges = normalizeOpenRanges(override.customOpenRanges)
  } else {
    const schedule = settings.weeklySchedule.find((s) => s.dayOfWeek === dayOfWeek)
    if (!schedule) return []
    openRanges = normalizeOpenRanges(schedule.openRanges)
  }

  const capacityPerSlot = override?.customCapacity ?? settings.capacityPerSlot

  const allSlots = generateSlots(date, openRanges, settings.slotDurationMinutes, settings.timezone)

  const minStartAt = new Date(now.getTime() + settings.minNoticeMinutes * 60 * 1000)
  const futureSlots = allSlots.filter((s) => s.startAt >= minStartAt)

  if (futureSlots.length === 0) return []

  const slotStartTimes = futureSlots.map((s) => s.startAt)
  const minStart = slotStartTimes[0]
  const maxEnd = futureSlots[futureSlots.length - 1].endAt

  const existingReservations = await prisma.reservation.groupBy({
    by: ["startAt"],
    where: {
      establishmentId,
      status: "CONFIRMED",
      startAt: { gte: minStart, lte: maxEnd },
      slotId: null, // Uniquement les réservations sans slot persisté
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
      isPersisted: false,
    }
  })
}

// ─── Génération de slots depuis WeeklySchedule ───────────────────────────────

/**
 * Génère des ReservationSlot en base depuis les WeeklySchedule pour N jours.
 * - Si des ressources actives existent → génère un slot par ressource × créneau
 * - Sinon → comportement global (resourceId = null)
 * - Anti-duplication : upsert par (establishmentId, startAt, resourceId)
 */
export async function generateAndPersistSlots(
  establishmentId: string,
  daysAhead: number
): Promise<{ created: number }> {
  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
    include: { weeklySchedule: true },
  })

  if (!settings || !settings.enabled) return { created: 0 }

  // Charger les ressources actives
  const resources = await prisma.reservationResource.findMany({
    where: { establishmentId, isActive: true },
    orderBy: { createdAt: "asc" },
  })
  const hasResources = resources.length > 0

  const now = new Date()
  let created = 0

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() + dayOffset)
    const dateStr = formatDateLocal(targetDate, settings.timezone)

    // Check override
    const override = await prisma.reservationOverride.findUnique({
      where: {
        establishmentId_date: { establishmentId, date: new Date(dateStr) },
      },
    })
    if (override?.isClosed) continue

    const dayOfWeek = getDayOfWeekInTz(targetDate, settings.timezone)
    let openRanges: TimeRange[]

    if (override?.customOpenRanges) {
      openRanges = normalizeOpenRanges(override.customOpenRanges)
    } else {
      const schedule = settings.weeklySchedule.find((s) => s.dayOfWeek === dayOfWeek)
      if (!schedule) continue
      openRanges = normalizeOpenRanges(schedule.openRanges)
    }

    const rawSlots = generateSlots(targetDate, openRanges, settings.slotDurationMinutes, settings.timezone)

    if (hasResources) {
      // ── Mode multi-ressources : un slot par (créneau × ressource) ────────────
      for (const resource of resources) {
        // Per-resource slot duration override
        const rules = getEffectiveRules(resource, settings)
        const resourceSlots = rules.slotDurationMinutes !== settings.slotDurationMinutes
          ? generateSlots(targetDate, openRanges, rules.slotDurationMinutes, settings.timezone)
          : rawSlots

        for (const slot of resourceSlots) {
          const capacity = resource.capacity

          // Anti-duplication par (establishmentId, startAt, resourceId)
          const existing = await prisma.reservationSlot.findFirst({
            where: { establishmentId, startAt: slot.startAt, resourceId: resource.id },
          })
          if (existing) continue

          await prisma.reservationSlot.create({
            data: {
              establishmentId,
              startAt: slot.startAt,
              endAt: slot.endAt,
              capacity,
              isActive: true,
              resourceId: resource.id,
              source: "AUTO",
            },
          })
          created++
        }
      }
    } else {
      // ── Mode global : slots sans ressource ────────────────────────────────────
      const capacity = override?.customCapacity ?? settings.capacityPerSlot

      for (const slot of rawSlots) {
        // Anti-duplication par (establishmentId, startAt, resourceId=null)
        const existing = await prisma.reservationSlot.findFirst({
          where: { establishmentId, startAt: slot.startAt, resourceId: null },
        })
        if (existing) continue

        await prisma.reservationSlot.create({
          data: {
            establishmentId,
            startAt: slot.startAt,
            endAt: slot.endAt,
            capacity,
            isActive: true,
            source: "AUTO",
          },
        })
        created++
      }
    }
  }

  return { created }
}

/**
 * Retourne les ressources disponibles (ayant encore de la capacité) pour un créneau donné.
 * Utilisé pour le mode PICK_TIME_FIRST.
 */
export async function getAvailableResourcesForSlot(
  establishmentId: string,
  startAt: Date,
  partySize: number = 1
): Promise<Array<{ id: string; name: string; remainingCapacity: number }>> {
  // Load settings for defaults
  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
  })

  // Chercher les slots persistés pour ce startAt avec une ressource
  const slots = await prisma.reservationSlot.findMany({
    where: {
      establishmentId,
      startAt,
      isActive: true,
      resourceId: { not: null },
    },
    include: { resource: true },
  })

  if (slots.length === 0) return []

  const slotIds = slots.map((s) => s.id)
  const bookedBySlot = await prisma.reservation.groupBy({
    by: ["slotId"],
    where: {
      establishmentId,
      status: "CONFIRMED",
      slotId: { in: slotIds },
    },
    _sum: { partySize: true },
  })

  const bookedMap = new Map<string, number>()
  for (const r of bookedBySlot) {
    if (r.slotId) bookedMap.set(r.slotId, r._sum.partySize ?? 0)
  }

  return slots
    .filter((slot) => {
      const booked = bookedMap.get(slot.id) ?? 0
      if (slot.capacity - booked < partySize) return false

      // Check per-resource party size constraints
      if (slot.resource && settings) {
        const rules = getEffectiveRules(slot.resource, settings)
        if (partySize < rules.minPartySize || partySize > rules.maxPartySize) return false
      }

      return true
    })
    .map((slot) => ({
      id: slot.resourceId!,
      name: slot.resource?.name ?? "Ressource",
      remainingCapacity: slot.capacity - (bookedMap.get(slot.id) ?? 0),
    }))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeOpenRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item: unknown) => {
      if (!item || typeof item !== "object") return null
      const obj = item as Record<string, unknown>
      const start = normalizeTimeValue(obj.start)
      const end = normalizeTimeValue(obj.end)
      if (!start || !end) return null
      return { start, end }
    })
    .filter((r): r is TimeRange => r !== null)
}

function normalizeTimeValue(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^\d{2}:\d{2}$/.test(value)) return value
    const match = value.match(/T(\d{2}:\d{2})/)
    if (match) return match[1]
    return null
  }
  if (value instanceof Date) {
    return value.toISOString().slice(11, 16)
  }
  return null
}

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

function parseLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  const [hour, minute] = timeStr.split(":").map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offset = getTzOffsetMinutes(candidate, timezone)
  return new Date(candidate.getTime() - offset * 60 * 1000)
}

function getTzOffsetMinutes(date: Date, timezone: string): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" })
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone })
  const diff = (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  return diff
}

// ─── Export des helpers pour les tests ──────────────────────────────────────
export { formatDateLocal, getDayOfWeekInTz, generateSlots, normalizeOpenRanges }
