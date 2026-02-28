import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { ACTIVITY_TYPES, ActivityTypeKey } from "@/lib/constants"
import { ActivityDetail } from "./ActivityDetail"
import { ClickTracker } from "./ClickTracker"

interface ActivityPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ActivityPageProps) {
  const { id } = await params
  const activity = await prisma.activity.findUnique({
    where: { id, status: "PUBLISHED" },
  })

  if (!activity) {
    return { title: "Activité non trouvée" }
  }

  const typeInfo = ACTIVITY_TYPES[activity.type as ActivityTypeKey]

  return {
    title: `${activity.title} - ${typeInfo?.label || activity.type}`,
    description: activity.description.slice(0, 160),
  }
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { id } = await params
  const session = await auth()

  const activity = await prisma.activity.findUnique({
    where: { id, status: "PUBLISHED" },
    include: {
      medias: {
        orderBy: { createdAt: "desc" },
      },
      establishment: {
        include: {
          reservationSettings: {
            include: {
              weeklySchedule: { orderBy: { dayOfWeek: "asc" } },
              customFieldDefs: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      events: {
        where: {
          startAt: { gte: new Date() },
        },
        orderBy: { startAt: "asc" },
        take: 10,
      },
      _count: {
        select: { favorites: true },
      },
    },
  })

  if (!activity) {
    notFound()
  }

  // Check if user has favorited this activity
  let isFavorited = false
  if (session?.user?.id) {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_activityId: {
          userId: session.user.id,
          activityId: activity.id,
        },
      },
    })
    isFavorited = !!favorite
  }

  // Separate reservationSettings from establishment to pass flat establishment to ActivityDetail
  const { reservationSettings, ...establishment } = activity.establishment

  return (
    <>
      {/* Track click/view via client-side component */}
      <ClickTracker activityId={activity.id} />
      <ActivityDetail
        activity={{ ...activity, establishment }}
        isFavorited={isFavorited}
        isAuthenticated={!!session}
        userId={session?.user?.id}
        reservationSettings={reservationSettings ?? null}
      />
    </>
  )
}
