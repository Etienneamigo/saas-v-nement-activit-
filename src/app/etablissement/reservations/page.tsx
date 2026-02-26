import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getReservationSettings, getEstablishmentReservations } from "@/app/actions/reservations"
import { ReservationsClient } from "./ReservationsClient"

export const metadata = { title: "Réservations" }

export default async function ReservationsPage() {
  const session = await auth()
  if (!session?.user?.establishmentId) redirect("/auth/connexion")

  const [settingsResult, reservationsResult] = await Promise.all([
    getReservationSettings(),
    getEstablishmentReservations(),
  ])

  return (
    <ReservationsClient
      initialSettings={settingsResult.settings ?? null}
      initialOverrides={settingsResult.overrides ?? []}
      initialReservations={"reservations" in reservationsResult ? reservationsResult.reservations : []}
    />
  )
}
