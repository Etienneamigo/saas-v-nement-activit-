import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { enforceApiRateLimit } from "../_helpers/rl"
import { UserRole } from "@prisma/client"
import { z } from "zod"

const patchEstablishmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(30).optional().nullable(),
  website: z.string().url("URL invalide pour website").max(2048).optional().nullable().or(z.literal("")),
  bookingUrl: z.string().url("URL invalide pour bookingUrl").max(2048).optional().nullable().or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  accessWheelchair: z.boolean().optional(),
  accessToilets: z.boolean().optional(),
  accessParking: z.boolean().optional(),
  accessElevator: z.boolean().optional(),
  accessLevelEntry: z.boolean().optional(),
}).strict()

export async function GET(request: NextRequest) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const user = await requireMobileAuth(request)
  if (user.role !== UserRole.ESTABLISHMENT || !user.establishmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const est = await prisma.establishment.findUnique({
    where: { id: user.establishmentId },
    include: {
      activity: { include: { medias: { orderBy: { createdAt: "asc" } } } },
    },
  })

  if (!est) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(est)
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const user = await requireMobileAuth(request)
  if (user.role !== UserRole.ESTABLISHMENT || !user.establishmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = patchEstablishmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      { status: 400 }
    )
  }

  // Convert empty string URLs to null for DB storage
  const data = { ...parsed.data } as Record<string, unknown>
  if (data.website === "") data.website = null
  if (data.bookingUrl === "") data.bookingUrl = null

  const updated = await prisma.establishment.update({
    where: { id: user.establishmentId },
    data,
  })

  return NextResponse.json(updated)
}
