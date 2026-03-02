"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { generateAndPersistSlots } from "@/lib/availability"

// ─── Schémas ─────────────────────────────────────────────────────────────────

const resourceSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  capacity: z.number().int().min(1, "Capacité min 1"),
  isActive: z.boolean().default(true),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  useCustomRules: z.boolean().default(false),
  minPartySizeOverride: z.number().int().min(1).nullable().optional(),
  maxPartySizeOverride: z.number().int().min(1).nullable().optional(),
  slotDurationMinutesOverride: z.number().int().min(15).max(480).nullable().optional(),
  bookingWindowDaysOverride: z.number().int().min(1).max(365).nullable().optional(),
})

const slotSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

const duplicateSchema = z.object({
  slotId: z.string().cuid(),
  targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(90),
})

// ─── Helpers auth ────────────────────────────────────────────────────────────

async function requireEstablishment() {
  const session = await auth()
  if (!session?.user?.establishmentId) {
    throw new Error("Non autorisé")
  }
  return session.user.establishmentId
}

// ─── RESSOURCES ──────────────────────────────────────────────────────────────

export async function getResources() {
  try {
    const establishmentId = await requireEstablishment()
    const resources = await prisma.reservationResource.findMany({
      where: { establishmentId },
      orderBy: { createdAt: "asc" },
    })
    return { resources }
  } catch {
    return { error: "Non autorisé", resources: [] }
  }
}

export async function createResource(data: unknown) {
  try {
    const establishmentId = await requireEstablishment()
    const parsed = resourceSchema.safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const resource = await prisma.reservationResource.create({
      data: { establishmentId, ...parsed.data },
    })

    revalidatePath("/etablissement/reservations")
    return { resource }
  } catch {
    return { error: "Non autorisé" }
  }
}

export async function updateResource(resourceId: string, data: unknown) {
  try {
    const establishmentId = await requireEstablishment()
    const parsed = resourceSchema.safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const resource = await prisma.reservationResource.findFirst({
      where: { id: resourceId, establishmentId },
    })
    if (!resource) return { error: "Ressource introuvable" }

    const updated = await prisma.reservationResource.update({
      where: { id: resourceId },
      data: parsed.data,
    })

    revalidatePath("/etablissement/reservations")
    return { resource: updated }
  } catch {
    return { error: "Non autorisé" }
  }
}

export async function deleteResource(resourceId: string) {
  try {
    const establishmentId = await requireEstablishment()
    const resource = await prisma.reservationResource.findFirst({
      where: { id: resourceId, establishmentId },
    })
    if (!resource) return { error: "Ressource introuvable" }

    await prisma.reservationResource.delete({ where: { id: resourceId } })
    revalidatePath("/etablissement/reservations")
    return { success: true }
  } catch {
    return { error: "Non autorisé" }
  }
}

// ─── CRÉNEAUX ────────────────────────────────────────────────────────────────

export async function getSlots(dateFrom?: string, dateTo?: string) {
  try {
    const establishmentId = await requireEstablishment()

    const where: Record<string, unknown> = { establishmentId }
    if (dateFrom || dateTo) {
      where.startAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      }
    }

    const slots = await prisma.reservationSlot.findMany({
      where,
      include: {
        resource: { select: { id: true, name: true } },
        _count: { select: { reservations: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startAt: "asc" },
    })

    return { slots }
  } catch {
    return { error: "Non autorisé", slots: [] }
  }
}

export async function createSlot(data: unknown) {
  try {
    const establishmentId = await requireEstablishment()
    const parsed = slotSchema.safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const { startAt, endAt, capacity, isActive, resourceId } = parsed.data

    if (new Date(endAt) <= new Date(startAt)) {
      return { error: "L'heure de fin doit être après l'heure de début" }
    }

    // Vérifier que la ressource appartient à l'établissement
    if (resourceId) {
      const res = await prisma.reservationResource.findFirst({
        where: { id: resourceId, establishmentId },
      })
      if (!res) return { error: "Ressource introuvable" }
    }

    const slot = await prisma.reservationSlot.create({
      data: {
        establishmentId,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        capacity,
        isActive,
        resourceId: resourceId ?? null,
        source: "MANUAL",
      },
      include: { resource: { select: { id: true, name: true } } },
    })

    revalidatePath("/etablissement/reservations")
    return { slot }
  } catch {
    return { error: "Non autorisé" }
  }
}

export async function updateSlot(slotId: string, data: unknown) {
  try {
    const establishmentId = await requireEstablishment()
    const parsed = slotSchema.partial().safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const slot = await prisma.reservationSlot.findFirst({
      where: { id: slotId, establishmentId },
    })
    if (!slot) return { error: "Créneau introuvable" }

    const updated = await prisma.reservationSlot.update({
      where: { id: slotId },
      data: {
        ...(parsed.data.startAt ? { startAt: new Date(parsed.data.startAt) } : {}),
        ...(parsed.data.endAt ? { endAt: new Date(parsed.data.endAt) } : {}),
        ...(parsed.data.capacity !== undefined ? { capacity: parsed.data.capacity } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.resourceId !== undefined ? { resourceId: parsed.data.resourceId ?? null } : {}),
      },
      include: { resource: { select: { id: true, name: true } } },
    })

    revalidatePath("/etablissement/reservations")
    return { slot: updated }
  } catch {
    return { error: "Non autorisé" }
  }
}

export async function deleteSlot(slotId: string) {
  try {
    const establishmentId = await requireEstablishment()
    const slot = await prisma.reservationSlot.findFirst({
      where: { id: slotId, establishmentId },
    })
    if (!slot) return { error: "Créneau introuvable" }

    await prisma.reservationSlot.delete({ where: { id: slotId } })
    revalidatePath("/etablissement/reservations")
    return { success: true }
  } catch {
    return { error: "Non autorisé" }
  }
}

export async function toggleSlotActive(slotId: string) {
  try {
    const establishmentId = await requireEstablishment()
    const slot = await prisma.reservationSlot.findFirst({
      where: { id: slotId, establishmentId },
    })
    if (!slot) return { error: "Créneau introuvable" }

    const updated = await prisma.reservationSlot.update({
      where: { id: slotId },
      data: { isActive: !slot.isActive },
    })

    revalidatePath("/etablissement/reservations")
    return { slot: updated }
  } catch {
    return { error: "Non autorisé" }
  }
}

// ─── GÉNÉRATION ──────────────────────────────────────────────────────────────

export async function generateSlots(daysAhead?: number) {
  try {
    const establishmentId = await requireEstablishment()
    const settings = await prisma.reservationSettings.findUnique({
      where: { establishmentId },
    })
    if (!settings) return { error: "Paramètres de réservation introuvables" }

    const days = daysAhead ?? settings.bookingWindowDays
    const result = await generateAndPersistSlots(establishmentId, days)

    revalidatePath("/etablissement/reservations")
    return { success: true, created: result.created }
  } catch {
    return { error: "Non autorisé" }
  }
}

// ─── DUPLICATION ─────────────────────────────────────────────────────────────

export async function duplicateSlot(data: unknown) {
  try {
    const establishmentId = await requireEstablishment()
    const parsed = duplicateSchema.safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const { slotId, targetDates } = parsed.data

    const sourceSlot = await prisma.reservationSlot.findFirst({
      where: { id: slotId, establishmentId },
    })
    if (!sourceSlot) return { error: "Créneau source introuvable" }

    // Extraire l'heure du slot source
    const sourceStart = sourceSlot.startAt
    const sourceEnd = sourceSlot.endAt
    const durationMs = sourceEnd.getTime() - sourceStart.getTime()

    // Heure locale du slot source (HH:mm)
    const sourceHour = sourceStart.getUTCHours()
    const sourceMinute = sourceStart.getUTCMinutes()

    let created = 0
    const errors: string[] = []

    for (const dateStr of targetDates) {
      try {
        // Construire startAt pour la date cible avec la même heure UTC
        const [year, month, day] = dateStr.split("-").map(Number)
        const newStart = new Date(Date.UTC(year, month - 1, day, sourceHour, sourceMinute))
        const newEnd = new Date(newStart.getTime() + durationMs)

        // Vérifier si le slot existe déjà
        const existing = await prisma.reservationSlot.findFirst({
          where: {
            establishmentId,
            startAt: newStart,
            resourceId: sourceSlot.resourceId,
          },
        })
        if (existing) continue

        await prisma.reservationSlot.create({
          data: {
            establishmentId,
            startAt: newStart,
            endAt: newEnd,
            capacity: sourceSlot.capacity,
            isActive: sourceSlot.isActive,
            resourceId: sourceSlot.resourceId,
            source: "MANUAL",
          },
        })
        created++
      } catch {
        errors.push(dateStr)
      }
    }

    revalidatePath("/etablissement/reservations")
    return { success: true, created, errors }
  } catch {
    return { error: "Non autorisé" }
  }
}

// ─── MES RÉSERVATIONS (utilisateur) ─────────────────────────────────────────

export async function getUserReservations(filter?: "upcoming" | "past") {
  const session = await auth()
  if (!session?.user?.id) return { error: "Non connecté", reservations: [] }

  const now = new Date()
  const where: Record<string, unknown> = {
    userId: session.user.id,
  }

  if (filter === "upcoming") {
    where.startAt = { gte: now }
    where.status = "CONFIRMED"
  } else if (filter === "past") {
    where.OR = [
      { startAt: { lt: now } },
      { status: { in: ["CANCELLED", "NO_SHOW"] } },
    ]
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      establishment: {
        select: {
          name: true,
          address: true,
          city: true,
          activity: { select: { id: true, title: true, type: true } },
        },
      },
      settings: {
        select: {
          cancellationEnabled: true,
          cancellationDeadlineHours: true,
        },
      },
      slot: { select: { id: true, startAt: true, endAt: true } },
      resource: { select: { name: true } },
    },
    orderBy: { startAt: filter === "past" ? "desc" : "asc" },
    take: 50,
  })

  return { reservations }
}

export async function cancelUserReservation(reservationId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Non connecté" }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { settings: true },
  })

  if (!reservation) return { error: "Réservation introuvable" }
  if (reservation.userId !== session.user.id) return { error: "Non autorisé" }
  if (reservation.status !== "CONFIRMED") return { error: "Cette réservation ne peut pas être annulée" }

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

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  return { success: true }
}
