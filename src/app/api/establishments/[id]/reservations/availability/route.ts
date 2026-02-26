import { NextRequest, NextResponse } from "next/server"
import { getAvailableSlots } from "@/lib/availability"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get("date")

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json(
      { error: "Paramètre date manquant ou invalide (YYYY-MM-DD)" },
      { status: 400 }
    )
  }

  const establishment = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { id: true },
  })

  if (!establishment) {
    return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 })
  }

  const slots = await getAvailableSlots(establishmentId, new Date(dateStr))

  return NextResponse.json({ slots })
}
