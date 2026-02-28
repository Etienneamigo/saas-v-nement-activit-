import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getReservationSettings, saveReservationSettings } from "@/app/actions/reservations"

// GET — Owner uniquement
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params
  const session = await auth()

  if (!session?.user?.establishmentId || session.user.establishmentId !== establishmentId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
  }

  const result = await getReservationSettings()
  return NextResponse.json(result)
}

// PUT — Owner uniquement
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params
  const session = await auth()

  if (!session?.user?.establishmentId || session.user.establishmentId !== establishmentId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const result = await saveReservationSettings(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
