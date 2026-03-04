import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { optionalMobileAuth } from "@/lib/mobile-auth"
import { enforceApiRateLimit } from "../../_helpers/rl"
import { ActivityStatus, UserRole } from "@prisma/client"

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const user = await optionalMobileAuth(request)
  const { id } = await ctx.params

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      establishment: {
        select: {
          id: true,
          name: true,
          phone: true,
          website: true,
          bookingUrl: true,
          address: true,
          city: true,
          zipCode: true,
          country: true,
          verifiedAt: true,
          accessWheelchair: true,
          accessToilets: true,
          accessParking: true,
          accessElevator: true,
          accessLevelEntry: true,
        },
      },
      medias: { orderBy: { createdAt: "asc" } },
    },
  })

  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const isOwner =
    user?.role === UserRole.ESTABLISHMENT &&
    user.establishmentId &&
    user.establishmentId === activity.establishmentId

  const canSeeDraft =
    activity.status === ActivityStatus.PUBLISHED ||
    user?.role === UserRole.ADMIN ||
    isOwner

  if (!canSeeDraft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let isFavorite = false
  if (user?.role === UserRole.USER) {
    const fav = await prisma.favorite.findUnique({
      where: {
        userId_activityId: { userId: user.id, activityId: activity.id },
      },
      select: { userId: true },
    })
    isFavorite = !!fav
  }

  if (activity.status === ActivityStatus.PUBLISHED) {
    prisma.activity
      .update({
        where: { id: activity.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {})
  }

  return NextResponse.json({ ...activity, isFavorite })
}
