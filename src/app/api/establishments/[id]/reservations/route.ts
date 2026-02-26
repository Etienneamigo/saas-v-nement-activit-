import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createReservation, getEstablishmentReservations } from "@/app/actions/reservations"

// POST /api/establishments/[id]/reservations — Créer une réservation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const result = await createReservation({ ...(body as object), establishmentId })

  if (result.error) {
    const status = result.error.includes("complet") ? 409 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ reservation: result.reservation }, { status: 201 })
}

// GET /api/establishments/[id]/reservations — Liste (owner uniquement)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params
  const session = await auth()

  if (!session?.user?.establishmentId || session.user.establishmentId !== establishmentId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const filters = {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  }

  const result = await getEstablishmentReservations(filters)

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ reservations: result.reservations })
}
