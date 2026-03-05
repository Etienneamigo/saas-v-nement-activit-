import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../../_helpers/rl"
import { z } from "zod"

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

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId, resourceId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const existing = await prisma.reservationResource.findFirst({
    where: { id: resourceId, establishmentId },
  })
  if (!existing) {
    return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = resourceSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const resource = await prisma.reservationResource.update({
    where: { id: resourceId },
    data: parsed.data,
  })

  return NextResponse.json({ resource })
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId, resourceId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const existing = await prisma.reservationResource.findFirst({
    where: { id: resourceId, establishmentId },
  })
  if (!existing) {
    return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 })
  }

  await prisma.reservationResource.delete({ where: { id: resourceId } })

  return NextResponse.json({ success: true })
}
