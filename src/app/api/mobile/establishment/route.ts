import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { enforceApiRateLimit } from "../_helpers/rl"
import { UserRole } from "@prisma/client"

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

  let body: any
  try { body = await request.json() } catch { body = {} }

  const data: any = {}
  const fields = ["name","phone","website","bookingUrl","address","city","zipCode","country","lat","lng","accessWheelchair","accessToilets","accessParking","accessElevator","accessLevelEntry"] as const
  for (const k of fields) {
    if (k in body) data[k] = body[k]
  }

  // basic validation
  if ("name" in data && typeof data.name !== "string") return NextResponse.json({ error: "Invalid name" }, { status: 400 })
  if ("lat" in data && data.lat !== null && typeof data.lat !== "number") return NextResponse.json({ error: "Invalid lat" }, { status: 400 })
  if ("lng" in data && data.lng !== null && typeof data.lng !== "number") return NextResponse.json({ error: "Invalid lng" }, { status: 400 })
  for (const boolField of ["accessWheelchair","accessToilets","accessParking","accessElevator","accessLevelEntry"] as const) {
    if (boolField in data && typeof data[boolField] !== "boolean") return NextResponse.json({ error: `Invalid ${boolField}` }, { status: 400 })
  }

  const updated = await prisma.establishment.update({
    where: { id: user.establishmentId },
    data,
  })

  return NextResponse.json(updated)
}
