"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { updateEstablishmentSettings } from "@/app/actions/establishment"
import { toast } from "sonner"
import { Globe, Calendar, Phone, Save, Accessibility } from "lucide-react"

interface SettingsFormProps {
  establishment: {
    name: string
    phone: string | null
    website: string | null
    bookingUrl: string | null
    address: string | null
    city: string | null
    zipCode: string | null
    accessWheelchair: boolean
    accessToilets: boolean
    accessParking: boolean
    accessElevator: boolean
    accessLevelEntry: boolean
  }
}

const ACCESSIBILITY_FIELDS = [
  { name: "accessWheelchair" as const, label: "Accès fauteuil roulant (PMR)" },
  { name: "accessToilets"    as const, label: "Toilettes accessibles PMR" },
  { name: "accessParking"    as const, label: "Parking PMR disponible" },
  { name: "accessElevator"   as const, label: "Ascenseur disponible" },
  { name: "accessLevelEntry" as const, label: "Accès plain-pied (sans marches)" },
]

export function SettingsForm({ establishment }: SettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    const result = await updateEstablishmentSettings(formData)
    setIsLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Parametres mis a jour avec succes")
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Presence en ligne
          </CardTitle>
          <CardDescription>
            Configurez vos liens web et de reservation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="website">Site web</Label>
            <Input
              id="website"
              name="website"
              type="url"
              placeholder="https://www.monsite.fr"
              defaultValue={establishment.website || ""}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              L&apos;URL de votre site web principal
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookingUrl" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Lien de reservation
            </Label>
            <Input
              id="bookingUrl"
              name="bookingUrl"
              type="url"
              placeholder="https://calendly.com/mon-etablissement"
              defaultValue={establishment.bookingUrl || ""}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Lien vers votre systeme de reservation (Calendly, Doctolib, etc.).
              Un bouton &quot;Reserver&quot; apparaitra sur votre page publique.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Contact
          </CardTitle>
          <CardDescription>
            Informations de contact affichees sur votre page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Telephone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="01 23 45 67 89"
              defaultValue={establishment.phone || ""}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Accessibilité ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Accessibility className="h-5 w-5" />
            Accessibilite
          </CardTitle>
          <CardDescription>
            Indiquez les equipements accessibles dans votre etablissement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ACCESSIBILITY_FIELDS.map(({ name, label }) => (
            <div key={name} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={name}
                name={name}
                defaultChecked={establishment[name]}
                disabled={isLoading}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <Label htmlFor={name} className="cursor-pointer font-normal">
                {label}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Etablissement :</strong> {establishment.name}</p>
            {establishment.address && (
              <p>
                <strong>Adresse :</strong> {establishment.address}, {establishment.zipCode} {establishment.city}
              </p>
            )}
            <p className="text-xs italic">
              Pour modifier le nom ou l&apos;adresse, contactez le support.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" />
          {isLoading ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  )
}
