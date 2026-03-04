import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../_helpers/rl"
import { z } from "zod"

const slotSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get("dateFrom") || undefined
  const dateTo = searchParams.get("dateTo") || undefined

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

  return NextResponse.json({ slots })
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = slotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { startAt, endAt, capacity, isActive, resourceId } = parsed.data

  if (new Date(endAt) <= new Date(startAt)) {
    return NextResponse.json({ error: "L'heure de fin doit être après l'heure de début" }, { status: 400 })
  }

  // Verify resource belongs to establishment
  if (resourceId) {
    const res = await prisma.reservationResource.findFirst({
      where: { id: resourceId, establishmentId },
    })
    if (!res) {
      return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 })
    }
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

  return NextResponse.json({ slot }, { status: 201 })
}
