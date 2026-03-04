import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { enforceApiRateLimit } from "../../_helpers/rl"

export async function GET(request: NextRequest) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const user = await requireMobileAuth(request)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") // "upcoming" | "past"

  const now = new Date()
  const where: Record<string, unknown> = {
    userId: user.id,
  }

  if (status === "upcoming") {
    where.startAt = { gte: now }
    where.status = "CONFIRMED"
  } else if (status === "past") {
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
    orderBy: { startAt: status === "past" ? "desc" : "asc" },
    take: 50,
  })

  return NextResponse.json({ reservations })
}
