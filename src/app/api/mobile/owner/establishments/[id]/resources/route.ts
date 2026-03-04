import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../_helpers/rl"
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

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const resources = await prisma.reservationResource.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ resources })
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

  const parsed = resourceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const resource = await prisma.reservationResource.create({
    data: { establishmentId, ...parsed.data },
  })

  return NextResponse.json({ resource }, { status: 201 })
}
