import { prisma } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EstablishmentActions } from "./EstablishmentActions"

export default async function EstablishmentsPage() {
  const establishments = await prisma.establishment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true, isActive: true } },
      activity: {
        select: {
          id: true,
          title: true,
          status: true,
          viewCount: true,
          adminPick: true,
          _count: { select: { favorites: true } },
        },
      },
      usedPromoCode: { select: { code: true } },
    },
  })

  function getSubscriptionBadge(status: string | null) {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-500">Actif</Badge>
      case "TRIALING":
        return <Badge className="bg-blue-500">Essai</Badge>
      case "PAST_DUE":
        return <Badge className="bg-orange-500">Paiement en retard</Badge>
      case "CANCELED":
        return <Badge variant="destructive">Annule</Badge>
      default:
        return <Badge variant="secondary">Non configure</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Etablissements</h1>
        <p className="text-muted-foreground">Gestion des etablissements et abonnements</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des etablissements</CardTitle>
          <CardDescription>{establishments.length} etablissement(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {establishments.map((establishment) => (
              <div
                key={establishment.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{establishment.name}</p>
                    {getSubscriptionBadge(establishment.subscriptionStatus)}
                    {establishment.verifiedAt && (
                      <Badge className="bg-blue-500">Verifie</Badge>
                    )}
                    {!establishment.user.isActive && (
                      <Badge variant="destructive">Compte desactive</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{establishment.user.email}</p>

                  {establishment.activity ? (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">{establishment.activity.title}</span>
                      <Badge
                        variant={establishment.activity.status === "PUBLISHED" ? "default" : "outline"}
                        className="ml-2 text-xs"
                      >
                        {establishment.activity.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                      </Badge>
                      {establishment.activity.adminPick && (
                        <Badge className="ml-2 text-xs bg-emerald-500">Coup de coeur</Badge>
                      )}
                      <span className="text-muted-foreground ml-4">
                        {establishment.activity.viewCount} vues, {establishment.activity._count.favorites} favoris
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">Aucune activite creee</p>
                  )}

                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    {establishment.trialEndsAt && (
                      <span>
                        Fin d&apos;essai: {new Date(establishment.trialEndsAt).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    {establishment.usedPromoCode && (
                      <span>Code promo: {establishment.usedPromoCode.code}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground mr-4">
                    Inscrit le {new Date(establishment.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                  <EstablishmentActions establishment={establishment} />
                </div>
              </div>
            ))}

            {establishments.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Aucun etablissement
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
