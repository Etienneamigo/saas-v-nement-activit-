import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { VideoFeed } from "./VideoFeed"

export const metadata = {
  title: "Feed Video - Wadelo",
  description: "Decouvrez les activites en video pres de chez vous",
}

export default async function FeedPage() {
  const session = await auth()

  // Pré-charger les favoris pour afficher l'état correct dès le rendu
  let favoritedActivityIds: string[] = []
  if (session?.user?.id && session.user.role === "USER") {
    const favorites = await prisma.favorite.findMany({
      where: { userId: session.user.id },
      select: { activityId: true },
    })
    favoritedActivityIds = favorites.map((f) => f.activityId)
  }

  return (
    <VideoFeed
      isAuthenticated={!!session}
      favoritedActivityIds={favoritedActivityIds}
    />
  )
}
