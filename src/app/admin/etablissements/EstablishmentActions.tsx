"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, CreditCard, ExternalLink, Award } from "lucide-react"
import { toggleEstablishmentSubscription, toggleAdminPick } from "@/app/actions/admin"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface EstablishmentActionsProps {
  establishment: {
    id: string
    name: string
    subscriptionStatus: string | null
    activity?: { id: string; title: string; adminPick?: boolean } | null
  }
}

export function EstablishmentActions({ establishment }: EstablishmentActionsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  async function handleToggleSubscription() {
    setIsLoading(true)
    const result = await toggleEstablishmentSubscription(establishment.id)
    setIsLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        result.establishment?.subscriptionStatus === "ACTIVE"
          ? "Abonnement activé"
          : "Abonnement annulé"
      )
      router.refresh()
    }
  }

  async function handleToggleAdminPick() {
    if (!establishment.activity?.id) return
    setIsLoading(true)
    const result = await toggleAdminPick(establishment.activity.id)
    setIsLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        result.activity?.adminPick
          ? "Coup de coeur Wadelo ajouté"
          : "Coup de coeur Wadelo retiré"
      )
      router.refresh()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isLoading}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {establishment.activity && (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/activite/${establishment.activity.id}`} target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                Voir l&apos;activité
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleAdminPick}>
              <Award className="mr-2 h-4 w-4" />
              {establishment.activity.adminPick
                ? "Retirer coup de coeur"
                : "Coup de coeur Wadelo"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleToggleSubscription}>
          <CreditCard className="mr-2 h-4 w-4" />
          {establishment.subscriptionStatus === "ACTIVE"
            ? "Annuler l'abonnement"
            : "Activer l'abonnement"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
