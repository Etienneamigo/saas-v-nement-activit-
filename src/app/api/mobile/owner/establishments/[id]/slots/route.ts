import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../_helpers/rl"
import { generateAndPersistSlots } from "@/lib/availability"
import { z } from "zod"
import { validateDateRange } from "@/lib/validations"

const createSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

const generateSchema = z.object({
  action: z.literal("generate"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),
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

  // Check if establishment has active resources → filter out orphan slots
  const activeResourceCount = await prisma.reservationResource.count({
    where: { establishmentId, isActive: true },
  })

  const where: Record<string, unknown> = { establishmentId }
  if (dateFrom || dateTo) {
    const dateResult = validateDateRange(dateFrom, dateTo)
    if ("error" in dateResult) {
      return NextResponse.json({ error: dateResult.error }, { status: 400 })
    }
    where.startAt = {
      ...(dateResult.from ? { gte: dateResult.from } : {}),
      ...(dateResult.to ? { lte: dateResult.to } : {}),
    }
  }
  // Si des ressources existent, masquer les slots orphelins (AUTO + resourceId=null)
  if (activeResourceCount > 0) {
    where.OR = [
      { resourceId: { not: null } },
      { source: "MANUAL" },
    ]
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

  // ── Try generate mode first (type-safe: separate parse) ──────────────────
  const genParsed = generateSchema.safeParse(body)
  if (genParsed.success) {
    const { dateFrom, dateTo } = genParsed.data
    const from = new Date(dateFrom)
    const to = new Date(dateTo)

    if (to < from) {
      return NextResponse.json(
        { error: "dateTo doit être >= dateFrom" },
        { status: 400 }
      )
    }

    // Calculate days ahead from today to dateTo (inclusive)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysAhead = Math.max(
      1,
      Math.ceil((to.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1
    )

    const result = await generateAndPersistSlots(establishmentId, daysAhead)
    return NextResponse.json({
      count: result.created,
      cleanedOrphans: result.cleanedOrphans,
    })
  }

  // ── Create mode ───────────────────────────────────────────────────────────
  const createParsed = createSchema.safeParse(body)
  if (!createParsed.success) {
    return NextResponse.json(
      { error: createParsed.error.issues[0].message, issues: createParsed.error.issues },
      { status: 400 }
    )
  }

  const { startAt, endAt, capacity, isActive, resourceId } = createParsed.data

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
