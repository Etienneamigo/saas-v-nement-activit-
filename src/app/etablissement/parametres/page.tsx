import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { SettingsForm } from "./SettingsForm"

export default async function SettingsPage() {
  const session = await auth()

  if (!session?.user?.establishmentId) {
    redirect("/auth/connexion")
  }

  const establishment = await prisma.establishment.findUnique({
    where: { id: session.user.establishmentId },
    select: {
      name: true,
      phone: true,
      website: true,
      bookingUrl: true,
      address: true,
      city: true,
      zipCode: true,
      accessWheelchair: true,
      accessToilets: true,
      accessParking: true,
      accessElevator: true,
      accessLevelEntry: true,
    },
  })

  if (!establishment) {
    redirect("/etablissement/dashboard")
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Parametres</h1>
        <p className="text-muted-foreground">
          Gerez les informations de votre etablissement
        </p>
      </div>

      <SettingsForm establishment={establishment} />
    </div>
  )
}
