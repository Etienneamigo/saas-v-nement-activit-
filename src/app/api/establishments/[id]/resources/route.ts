import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { z } from "zod"

const resourceSchema = z.object({
  name: z.string().min(1).max(100),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
})

async function requireOwner(establishmentId: string) {
  const session = await auth()
  if (!session?.user?.establishmentId) return null
  if (session.user.establishmentId !== establishmentId) return null
  return session
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const resources = await prisma.reservationResource.findMany({
    where: { establishmentId: id, isActive: true },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ resources })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await requireOwner(id)
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const body = await request.json()
  const parsed = resourceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const resource = await prisma.reservationResource.create({
    data: { establishmentId: id, ...parsed.data },
  })

  return NextResponse.json({ resource }, { status: 201 })
}
