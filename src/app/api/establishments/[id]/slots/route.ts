import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { z } from "zod"
import { generateAndPersistSlots } from "@/lib/availability"

const slotSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

async function requireOwner(establishmentId: string) {
  const session = await auth()
  if (!session?.user?.establishmentId) return null
  if (session.user.establishmentId !== establishmentId) return null
  return session
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await requireOwner(id)
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")

  const where: Record<string, unknown> = { establishmentId: id }
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await requireOwner(id)
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const body = await request.json()

  // Special action: generate from weekly schedule
  if (body.action === "generate") {
    const days = body.days ?? 30
    const result = await generateAndPersistSlots(id, days)
    return NextResponse.json({ created: result.created })
  }

  // Create slot
  const parsed = slotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const { startAt, endAt, capacity, isActive, resourceId } = parsed.data

  const slot = await prisma.reservationSlot.create({
    data: {
      establishmentId: id,
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
