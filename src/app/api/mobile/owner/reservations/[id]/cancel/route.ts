import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { enforceApiRateLimit } from "../../../../_helpers/rl"
import { UserRole } from "@prisma/client"

/**
 * Owner cancels a reservation on their establishment.
 * No cancellation deadline check for owners.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const user = await requireMobileAuth(request)
  const { id: reservationId } = await ctx.params

  if (user.role !== UserRole.ESTABLISHMENT && user.role !== ("OWNER" as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!user.establishmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
  })

  if (!reservation) {
    return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 })
  }

  // Verify owner owns the establishment this reservation belongs to
  if (reservation.establishmentId !== user.establishmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Cette réservation ne peut pas être annulée" }, { status: 400 })
  }

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
