import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../_helpers/rl"

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
  const status = searchParams.get("status") || undefined
  const dateFrom = searchParams.get("dateFrom") || undefined
  const dateTo = searchParams.get("dateTo") || undefined

  const where: Record<string, unknown> = { establishmentId }

  if (status) {
    where.status = status
  }

  if (dateFrom || dateTo) {
    where.startAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    }
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      user: { select: { email: true, name: true } },
      customValues: { include: { fieldDef: true } },
      resource: { select: { id: true, name: true } },
      slot: { select: { id: true, startAt: true, endAt: true } },
    },
    orderBy: { startAt: "asc" },
  })

  return NextResponse.json({ reservations })
}
