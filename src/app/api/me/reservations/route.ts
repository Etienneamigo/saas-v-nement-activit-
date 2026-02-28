import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") // "upcoming" | "past"

  const now = new Date()
  const where: Record<string, unknown> = { userId: session.user.id }

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
