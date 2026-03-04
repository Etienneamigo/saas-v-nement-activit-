import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enforceApiRateLimit } from "../../../../_helpers/rl"

/**
 * Public endpoint: get reservation settings for a given establishment.
 * Used by the mobile booking widget to show configuration.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId } = await ctx.params

  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
    include: {
      weeklySchedule: { orderBy: { dayOfWeek: "asc" } },
      customFieldDefs: { orderBy: { order: "asc" } },
    },
  })

  if (!settings) {
    return NextResponse.json({ error: "Paramètres introuvables" }, { status: 404 })
  }

  return NextResponse.json({ settings })
}
