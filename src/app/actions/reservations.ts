"use server"

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { getAvailableSlots, getAvailableResourcesForSlot } from "@/lib/availability"
import { getEffectiveRules } from "@/lib/resource-rules"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import {
  sendReservationConfirmationEmail,
  sendReservationNotificationToEstablishment,
} from "@/lib/email-reservation"

// ─── Schémas Zod ────────────────────────────────────────────────────────────

const timeRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis"),
})

const weeklyScheduleSchema = z.record(
  z.string(), // dayOfWeek as string "0"…"6"
  z.array(timeRangeSchema)
)

const customFieldDefSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, "Label requis"),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "SELECT", "PHONE", "EMAIL", "CHECKBOX"]),
  required: z.boolean().default(false),
  optionsJson: z.array(z.string()).optional(),
  order: z.number().int().default(0),
})

const reservationSettingsSchema = z.object({
  enabled: z.boolean(),
  showExternalLinkAlso: z.boolean().default(false),
  timezone: z.string().default("Europe/Paris"),
  slotDurationMinutes: z.number().int().min(15).max(480),
  capacityPerSlot: z.number().int().min(1).max(10000),
  minPartySize: z.number().int().min(1),
  maxPartySize: z.number().int().min(1),
  minNoticeMinutes: z.number().int().min(0),
  bookingWindowDays: z.number().int().min(1).max(365),
  cancellationEnabled: z.boolean().default(true),
  cancellationDeadlineHours: z.number().int().min(0),
  confirmationMessage: z.string().optional(),
  cancellationPolicyText: z.string().optional(),
  resourceSelectionMode: z.enum(["HIDDEN", "PICK_RESOURCE_FIRST", "PICK_TIME_FIRST"]).default("HIDDEN"),
  weeklySchedule: weeklyScheduleSchema.default({}),
  customFieldDefs: z.array(customFieldDefSchema).default([]),
})

// Accepte un ISO string OU un objet Date (sérialisation server action Next.js)
const dateOrIsoString = z
  .union([
    z.string().datetime(),
    z.date(),
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : v))

const createReservationSchema = z.object({
  establishmentId: z.string().cuid(),
  startAt: dateOrIsoString,
  partySize: z.number().int().min(1),
  customerName: z.string().min(1, "Nom requis"),
  customerEmail: z.string().email("Email invalide"),
  customerPhone: z.string().optional(),
  customFieldValues: z.record(z.string(), z.string()).default({}),
  slotId: z.string().cuid().optional().nullable(),
  resourceId: z.string().cuid().optional().nullable(),
})

const overrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD requis"),
  isClosed: z.boolean(),
  customOpenRanges: z.array(timeRangeSchema).optional(),
  customCapacity: z.number().int().min(1).optional(),
})

// ─── Get Settings (owner) ────────────────────────────────────────────────────

export async function getReservationSettings() {
  const session = await auth()
  if (!session?.user?.establishmentId) return { error: "Non autorisé" }

  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId: session.user.establishmentId },
    include: {
      weeklySchedule: { orderBy: { dayOfWeek: "asc" } },
      customFieldDefs: { orderBy: { order: "asc" } },
    },
  })

  // Overrides
  const overrides = await prisma.reservationOverride.findMany({
    where: { establishmentId: session.user.establishmentId },
    orderBy: { date: "asc" },
  })

  return { settings, overrides }
}

// ─── Save Settings (owner) ───────────────────────────────────────────────────

export async function saveReservationSettings(data: unknown) {
  const session = await auth()
  if (!session?.user?.establishmentId) return { error: "Non autorisé" }

  const parsed = reservationSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const {
    weeklySchedule,
    customFieldDefs,
    ...settingsData
  } = parsed.data

  const establishmentId = session.user.establishmentId

  await prisma.$transaction(async (tx) => {
    // Upsert settings
    const settings = await tx.reservationSettings.upsert({
      where: { establishmentId },
      create: { establishmentId, ...settingsData },
      update: settingsData,
    })

    // Sync weekly schedule
    await tx.weeklySchedule.deleteMany({ where: { settingsId: settings.id } })
    const scheduleEntries = Object.entries(weeklySchedule)
      .filter(([, ranges]) => ranges.length > 0)
      .map(([day, ranges]) => ({
        settingsId: settings.id,
        dayOfWeek: parseInt(day),
        openRanges: ranges,
      }))
    if (scheduleEntries.length > 0) {
      await tx.weeklySchedule.createMany({ data: scheduleEntries })
    }

    // Sync custom field defs
    const existingIds = customFieldDefs.filter((f) => f.id).map((f) => f.id as string)
    // Delete removed fields
    await tx.reservationCustomFieldDef.deleteMany({
      where: { settingsId: settings.id, id: { notIn: existingIds } },
    })
    // Upsert each field
    for (const field of customFieldDefs) {
      const optionsJson = field.optionsJson?.length
        ? (field.optionsJson as Prisma.InputJsonValue)
        : Prisma.JsonNull
      const fieldData = {
        settingsId: settings.id,
        label: field.label,
        type: field.type,
        required: field.required,
        optionsJson,
        order: field.order,
      }
      if (field.id) {
        await tx.reservationCustomFieldDef.update({ where: { id: field.id }, data: fieldData })
      } else {
        await tx.reservationCustomFieldDef.create({ data: fieldData })
      }
    }
  })

  revalidatePath(`/etablissement/reservations`)
  return { success: true }
}

// ─── Override CRUD ───────────────────────────────────────────────────────────

export async function saveReservationOverride(data: unknown) {
  const session = await auth()
  if (!session?.user?.establishmentId) return { error: "Non autorisé" }

  const parsed = overrideSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { date, isClosed, customOpenRanges, customCapacity } = parsed.data

  await prisma.reservationOverride.upsert({
    where: {
      establishmentId_date: {
        establishmentId: session.user.establishmentId,
        date: new Date(date),
      },
    },
    create: {
      establishmentId: session.user.establishmentId,
      date: new Date(date),
      isClosed,
      customOpenRanges: customOpenRanges ? (customOpenRanges as Prisma.InputJsonValue) : Prisma.JsonNull,
      customCapacity: customCapacity ?? null,
    },
    update: {
      isClosed,
      customOpenRanges: customOpenRanges ? (customOpenRanges as Prisma.InputJsonValue) : Prisma.JsonNull,
      customCapacity: customCapacity ?? null,
    },
  })

  revalidatePath(`/etablissement/reservations`)
  return { success: true }
}

export async function deleteReservationOverride(date: string) {
  const session = await auth()
  if (!session?.user?.establishmentId) return { error: "Non autorisé" }

  await prisma.reservationOverride.deleteMany({
    where: { establishmentId: session.user.establishmentId, date: new Date(date) },
  })

  revalidatePath(`/etablissement/reservations`)
  return { success: true }
}

// ─── Get Availability (public) ───────────────────────────────────────────────

export async function getAvailability(
  establishmentId: string,
  dateStr: string,
  resourceId?: string | null
) {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { error: "Date invalide", slots: [] }

  let slots = await getAvailableSlots(establishmentId, date)

  // Filtrer par ressource si demandé (PICK_RESOURCE_FIRST)
  if (resourceId) {
    slots = slots.filter((s) => s.resourceId === resourceId)
  }

  return { slots }
}

// ─── Get resources available for a specific slot (PICK_TIME_FIRST) ────────────

export async function getResourcesForSlot(
  establishmentId: string,
  startAtStr: string,
  partySize: number = 1
) {
  const startAt = new Date(startAtStr)
  if (isNaN(startAt.getTime())) return { error: "Date invalide", resources: [] }

  const resources = await getAvailableResourcesForSlot(establishmentId, startAt, partySize)
  return { resources }
}

// ─── Create Reservation (user) ───────────────────────────────────────────────

export async function createReservation(data: unknown) {
  const session = await auth()

  const parsed = createReservationSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const {
    establishmentId,
    startAt: startAtStr,
    partySize,
    customerName,
    customerEmail,
    customerPhone,
    customFieldValues,
    slotId,
    resourceId,
  } = parsed.data

  const startAt = new Date(startAtStr)

  // Charger les settings
  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
    include: { customFieldDefs: true },
  })

  if (!settings || !settings.enabled) {
    return { error: "Les réservations ne sont pas disponibles pour cet établissement" }
  }

  // Load resource if specified, to compute effective rules (capacity = source of truth for maxPartySize)
  let resource: { capacity: number; useCustomRules: boolean; minPartySizeOverride: number | null; maxPartySizeOverride: number | null; slotDurationMinutesOverride: number | null; bookingWindowDaysOverride: number | null } | null = null
  if (resourceId) {
    resource = await prisma.reservationResource.findUnique({
      where: { id: resourceId },
      select: { capacity: true, useCustomRules: true, minPartySizeOverride: true, maxPartySizeOverride: true, slotDurationMinutesOverride: true, bookingWindowDaysOverride: true },
    })
  }
  const effectiveRules = getEffectiveRules(resource, settings)

  // Vérifier partySize bounds (using effective rules for resource)
  if (partySize < effectiveRules.minPartySize || partySize > effectiveRules.maxPartySize) {
    return { error: `La taille du groupe doit être entre ${effectiveRules.minPartySize} et ${effectiveRules.maxPartySize}` }
  }

  // Vérifier minNotice
  const now = new Date()
  const minStartAt = new Date(now.getTime() + settings.minNoticeMinutes * 60 * 1000)
  if (startAt < minStartAt) {
    return { error: "Ce créneau est trop proche. Veuillez choisir un autre horaire." }
  }

  // Vérifier booking window (using effective rules)
  const maxBookingDate = new Date(now)
  maxBookingDate.setDate(maxBookingDate.getDate() + effectiveRules.bookingWindowDays)
  if (startAt > maxBookingDate) {
    return { error: "Ce créneau dépasse la fenêtre de réservation autorisée." }
  }

  const endAt = new Date(startAt.getTime() + effectiveRules.slotDurationMinutes * 60 * 1000)

  // Vérifier les champs obligatoires
  const requiredFields = settings.customFieldDefs.filter((f) => f.required)
  for (const field of requiredFields) {
    if (!customFieldValues[field.id]) {
      return { error: `Le champ "${field.label}" est requis` }
    }
  }

  // ─── Transaction avec vérification de capacité ───────────────────────────
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      let capacity: number
      let resolvedResourceId: string | null = resourceId ?? null

      if (slotId) {
        // ── Mode slots persistés ──────────────────────────────────────────
        const slot = await tx.reservationSlot.findUnique({ where: { id: slotId } })
        if (!slot || !slot.isActive) throw new Error("SLOT_UNAVAILABLE")

        capacity = slot.capacity

        // Si le slot a une ressource, l'utiliser
        if (slot.resourceId) {
          resolvedResourceId = slot.resourceId
        }

        // Auto-assign si HIDDEN et pas de ressource explicite : prendre le premier slot
        // actif avec capacité suffisante pour ce startAt (dans la même plage horaire)
        if (!resolvedResourceId && settings.resourceSelectionMode === "HIDDEN") {
          const alternateSlot = await tx.reservationSlot.findFirst({
            where: {
              establishmentId,
              startAt: slot.startAt,
              isActive: true,
              resourceId: { not: null },
            },
            include: { resource: true },
          })
          if (alternateSlot?.resourceId) {
            const altBooked = await tx.reservation.aggregate({
              where: { slotId: alternateSlot.id, status: "CONFIRMED" },
              _sum: { partySize: true },
            })
            const altAlreadyBooked = altBooked._sum.partySize ?? 0
            if (altAlreadyBooked + partySize <= alternateSlot.capacity) {
              resolvedResourceId = alternateSlot.resourceId
            }
          }
        }

        // Compter les réservations sur ce slot
        const booked = await tx.reservation.aggregate({
          where: { slotId, status: "CONFIRMED" },
          _sum: { partySize: true },
        })
        const alreadyBooked = booked._sum.partySize ?? 0

        if (alreadyBooked + partySize > capacity) throw new Error("SLOT_FULL")
      } else {
        // ── Mode à la volée ───────────────────────────────────────────────
        const booked = await tx.reservation.aggregate({
          where: {
            establishmentId,
            status: "CONFIRMED",
            startAt,
            slotId: null,
          },
          _sum: { partySize: true },
        })
        const alreadyBooked = booked._sum.partySize ?? 0

        const override = await tx.reservationOverride.findUnique({
          where: {
            establishmentId_date: {
              establishmentId,
              date: new Date(startAt.toISOString().split("T")[0]),
            },
          },
        })
        capacity = override?.customCapacity ?? settings.capacityPerSlot

        if (alreadyBooked + partySize > capacity) throw new Error("SLOT_FULL")
      }

      // Créer la réservation
      const newReservation = await tx.reservation.create({
        data: {
          settingsId: settings.id,
          establishmentId,
          userId: session?.user?.id ?? null,
          slotId: slotId ?? null,
          resourceId: resolvedResourceId,
          startAt,
          endAt,
          partySize,
          status: "CONFIRMED",
          customerName,
          customerEmail,
          customerPhone: customerPhone || null,
          customValues: {
            create: Object.entries(customFieldValues).map(([fieldDefId, value]) => ({
              fieldDefId,
              value,
            })),
          },
        },
        include: {
          customValues: true,
          establishment: {
            select: {
              name: true,
              address: true,
              city: true,
              phone: true,
              activity: { select: { title: true } },
            },
          },
        },
      })

      return newReservation
    })

    // ── Email de confirmation client (non bloquant) ─────────────────────────
    const emailTo = customerEmail
    if (emailTo) {
      console.info(`[reservation:email] Tentative envoi confirmation reservationId=${reservation.id} → ${emailTo}`)
      sendReservationConfirmationEmail({
        customerName,
        customerEmail: emailTo,
        establishmentName: reservation.establishment.name,
        establishmentAddress: reservation.establishment.address,
        establishmentCity: reservation.establishment.city,
        activityTitle: reservation.establishment.activity?.title,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        partySize: reservation.partySize,
        cancellationPolicyText: settings.cancellationPolicyText,
        reservationId: reservation.id,
      })
        .then(() => console.info(`[reservation:email] Confirmation envoyée reservationId=${reservation.id}`))
        .catch((err) => console.error(`[reservation:email] Erreur envoi confirmation reservationId=${reservation.id}:`, err))
    } else {
      console.warn(`[reservation:email] Pas d'email client pour reservationId=${reservation.id} — email non envoyé`)
    }

    // ── Email notification établissement (non bloquant) ─────────────────────
    // Récupérer l'email de l'user de l'établissement pour notification
    void prisma.establishment.findUnique({
      where: { id: establishmentId },
      include: { user: { select: { email: true } } },
    }).then((est) => {
      const notifEmail = est?.user?.email
      if (!notifEmail) return
      console.info(`[reservation:email] Tentative envoi notification établissement reservationId=${reservation.id} → ${notifEmail}`)
      return sendReservationNotificationToEstablishment(notifEmail, {
        customerName,
        customerEmail,
        establishmentName: reservation.establishment.name,
        establishmentAddress: reservation.establishment.address,
        establishmentCity: reservation.establishment.city,
        activityTitle: reservation.establishment.activity?.title,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        partySize: reservation.partySize,
        reservationId: reservation.id,
      })
    }).catch((err) => console.error(`[reservation:email] Erreur notification établissement reservationId=${reservation.id}:`, err))

    revalidatePath(`/activite`)
    return { reservation }
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_FULL") {
      return { error: "Ce créneau est complet. Veuillez choisir un autre horaire." }
    }
    if (err instanceof Error && err.message === "SLOT_UNAVAILABLE") {
      return { error: "Ce créneau n'est plus disponible." }
    }
    console.error("createReservation error:", err)
    return { error: "Erreur lors de la création de la réservation" }
  }
}

// ─── Cancel Reservation ───────────────────────────────────────────────────────

export async function cancelReservation(reservationId: string) {
  const session = await auth()
  if (!session?.user) return { error: "Non autorisé" }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { settings: true },
  })

  if (!reservation) return { error: "Réservation introuvable" }

  // Vérifier droits : owner de la réservation ou gestionnaire de l'établissement
  const isUser = reservation.userId === session.user.id
  const isOwner = session.user.establishmentId === reservation.establishmentId

  if (!isUser && !isOwner) {
    return { error: "Non autorisé" }
  }

  // Vérifier délai d'annulation (côté user uniquement)
  if (isUser && !isOwner) {
    const settings = reservation.settings
    if (!settings.cancellationEnabled) {
      return { error: "Les annulations ne sont pas autorisées pour cet établissement" }
    }

    const deadline = new Date(
      reservation.startAt.getTime() - settings.cancellationDeadlineHours * 3600 * 1000
    )
    if (new Date() > deadline) {
      return { error: `L'annulation n'est plus possible (délai de ${settings.cancellationDeadlineHours}h dépassé)` }
    }
  }

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  revalidatePath(`/etablissement/reservations`)
  return { success: true }
}

// ─── Get Reservations (owner) ────────────────────────────────────────────────

export async function getEstablishmentReservations(filters?: {
  dateFrom?: string
  dateTo?: string
  status?: string
}) {
  const session = await auth()
  if (!session?.user?.establishmentId) return { error: "Non autorisé", reservations: [] }

  const where: Record<string, unknown> = {
    establishmentId: session.user.establishmentId,
  }

  if (filters?.status) {
    where.status = filters.status
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.startAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    }
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      user: { select: { email: true, name: true } },
      customValues: { include: { fieldDef: true } },
    },
    orderBy: { startAt: "asc" },
  })

  return { reservations }
}
