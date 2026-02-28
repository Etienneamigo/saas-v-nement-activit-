import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getReservationSettings, getEstablishmentReservations } from "@/app/actions/reservations"
import { getResources } from "@/app/actions/slots"
import { ReservationsClient } from "./ReservationsClient"

export const metadata = { title: "Réservations" }

export default async function ReservationsPage() {
  const session = await auth()
  if (!session?.user?.establishmentId) redirect("/auth/connexion")

  const [settingsResult, reservationsResult, resourcesResult] = await Promise.all([
    getReservationSettings(),
    getEstablishmentReservations(),
    getResources(),
  ])

  return (
    <ReservationsClient
      initialSettings={settingsResult.settings ?? null}
      initialOverrides={settingsResult.overrides ?? []}
      initialReservations={"reservations" in reservationsResult ? reservationsResult.reservations : []}
      initialResources={resourcesResult.resources ?? []}
    />
  )
}
