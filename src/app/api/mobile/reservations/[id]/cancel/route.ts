import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { enforceApiRateLimit } from "../../../_helpers/rl"

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const user = await requireMobileAuth(request)
  const { id } = await ctx.params

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { settings: true },
  })

  if (!reservation) {
    return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 })
  }

  if (reservation.userId !== user.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
  }

  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Cette réservation ne peut pas être annulée" }, { status: 400 })
  }

  const settings = reservation.settings
  if (!settings.cancellationEnabled) {
    return NextResponse.json(
      { error: "Les annulations ne sont pas autorisées pour cet établissement" },
      { status: 400 }
    )
  }

  const deadline = new Date(
    reservation.startAt.getTime() - settings.cancellationDeadlineHours * 3600 * 1000
  )
  if (new Date() > deadline) {
    return NextResponse.json(
      { error: `L'annulation n'est plus possible (délai de ${settings.cancellationDeadlineHours}h dépassé)` },
      { status: 400 }
    )
  }

  await prisma.reservation.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
