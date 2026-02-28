import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { MyReservationsClient } from "./MyReservationsClient"

export const metadata = {
  title: "Mes réservations - Wadelo",
}

export default async function MyReservationsPage() {
  const session = await auth()

  if (!session) {
    redirect("/auth/connexion?from=/profil/reservations")
  }

  if (session.user.role !== "USER") {
    redirect("/")
  }

  return <MyReservationsClient />
}
