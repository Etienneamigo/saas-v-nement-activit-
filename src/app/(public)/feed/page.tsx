import { auth } from "@/lib/auth"
import { VideoFeed } from "./VideoFeed"

export const metadata = {
  title: "Feed Video - Wadelo",
  description: "Decouvrez les activites en video pres de chez vous",
}

export default async function FeedPage() {
  const session = await auth()
  return <VideoFeed isAuthenticated={!!session} />
}
