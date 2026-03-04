import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../../_helpers/rl"
import { z } from "zod"

const slotSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; slotId: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId, slotId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const existing = await prisma.reservationSlot.findFirst({
    where: { id: slotId, establishmentId },
  })
  if (!existing) {
    return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = slotSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const slot = await prisma.reservationSlot.update({
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

  return NextResponse.json({ slot })
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; slotId: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId, slotId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const existing = await prisma.reservationSlot.findFirst({
    where: { id: slotId, establishmentId },
  })
  if (!existing) {
    return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })
  }

  await prisma.reservationSlot.delete({ where: { id: slotId } })

  return NextResponse.json({ success: true })
}
