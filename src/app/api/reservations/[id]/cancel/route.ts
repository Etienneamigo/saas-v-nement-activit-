import { NextRequest, NextResponse } from "next/server"
import { cancelReservation } from "@/app/actions/reservations"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reservationId } = await params
  const result = await cancelReservation(reservationId)

  if (result.error) {
    const status = result.error === "Non autorisé" ? 403 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ success: true })
}
