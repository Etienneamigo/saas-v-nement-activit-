import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ACTIVITY_TYPES, ActivityTypeKey } from "@/lib/constants"
import { Plus, Eye, Heart, Edit, MapPin, ExternalLink, Settings, CreditCard, AlertCircle, BadgeCheck, ShieldCheck } from "lucide-react"
import { ActivityActions } from "./ActivityActions"
import { AnalyticsCard } from "./AnalyticsCard"
import { getSubscriptionDisplayState, isSubscriptionActive } from "@/lib/subscription"

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user?.establishmentId) {
    return null
  }

  const establishment = await prisma.establishment.findUnique({
    where: { id: session.user.establishmentId },
  })

  // 1 establishment = 1 activity (1:1 constraint)
  const activity = await prisma.activity.findUnique({
    where: { establishmentId: session.user.establishmentId },
    include: {
      medias: true,
      _count: {
        select: { favorites: true }
      }
    },
  })

  const hasActivity = !!activity
  const typeInfo = activity ? ACTIVITY_TYPES[activity.type as ActivityTypeKey] : null
  const firstImage = activity?.medias.find(m => m.kind === "IMAGE")

  // Normalize upload URLs to use API route for proper MIME type handling
  function normalizeUploadUrl(url: string): string {
    if (url.startsWith("/uploads/")) {
      return url.replace("/uploads/", "/api/uploads/")
    }
    return url
  }

  // Calculate subscription status using shared logic
  const subState = establishment ? getSubscriptionDisplayState({
    subscriptionStatus: establishment.subscriptionStatus,
    trialEndsAt: establishment.trialEndsAt,
    currentPeriodEnd: establishment.currentPeriodEnd,
  }) : null
  const subActive = establishment ? isSubscriptionActive({
    subscriptionStatus: establishment.subscriptionStatus,
    trialEndsAt: establishment.trialEndsAt,
    currentPeriodEnd: establishment.currentPeriodEnd,
  }) : false
  const isTrialing = subState?.status === "trialing" || subState?.status === "canceled_trial_active"
  const trialExpired = subState?.status === "trialing" && "daysRemaining" in subState && subState.daysRemaining === 0
  const daysLeft = (subState && "daysRemaining" in subState) ? subState.daysRemaining : 0
  const showTrialAlert = isTrialing && (trialExpired || daysLeft <= 14)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{establishment?.name}</h1>
          <p className="text-muted-foreground">
            {hasActivity ? "Gérez votre activité" : "Configurez votre activité"}
          </p>
        </div>
        {hasActivity ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/activite/${activity.id}`} target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                Voir la page publique
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/etablissement/activites/${activity.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Modifier
              </Link>
            </Button>
          </div>
        ) : (
          <Button asChild>
            <Link href="/etablissement/activites/nouvelle">
              <Plus className="mr-2 h-4 w-4" />
              Créer mon activité
            </Link>
          </Button>
        )}
      </div>

      {hasActivity ? (
        <>
          {/* Subscription Alert */}
          {(subState?.status === "canceled_trial_active" || showTrialAlert || subState?.status === "canceled") && (
            <Card className={
              subState?.status === "canceled" ? "border-red-300 bg-red-50" :
              subState?.status === "canceled_trial_active" ? "border-orange-300 bg-orange-50" :
              trialExpired ? "border-red-300 bg-red-50" : "border-orange-300 bg-orange-50"
            }>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className={`h-5 w-5 ${
                    subState?.status === "canceled" || trialExpired ? "text-red-600" : "text-orange-600"
                  }`} />
                  <div>
                    <p className={`font-medium ${
                      subState?.status === "canceled" || trialExpired ? "text-red-800" : "text-orange-800"
                    }`}>
                      {subState?.label}
                    </p>
                    <p className={`text-sm ${
                      subState?.status === "canceled" || trialExpired ? "text-red-600" : "text-orange-600"
                    }`}>
                      {subState?.description}
                    </p>
                  </div>
                </div>
                <Button asChild variant={subState?.status === "canceled" || trialExpired ? "destructive" : "default"}>
                  <Link href="/etablissement/abonnement">
                    <CreditCard className="mr-2 h-4 w-4" />
                    {subState?.status === "canceled_trial_active" ? "Réactiver" : "Gérer l\u2019abonnement"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Statistiques */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Statut</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={activity.status === "PUBLISHED" ? "default" : "secondary"} className="text-sm">
                  {activity.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {activity.status === "PUBLISHED"
                    ? "Visible dans les recherches"
                    : "Non visible publiquement"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vues totales</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity.viewCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Nombre de visites sur votre page
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Favoris</CardTitle>
                <Heart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity._count.favorites}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Utilisateurs ayant ajouté en favoris
                </p>
              </CardContent>
            </Card>
            <Card className="hover:bg-gray-50 transition-colors">
              <Link href="/etablissement/abonnement">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Abonnement</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Badge variant={subActive ? "default" : "destructive"}>
                    {subState?.label || "Non configuré"}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {subActive && daysLeft > 0
                      ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`
                      : subActive
                        ? "Abonnement actif"
                        : "Cliquez pour vous abonner"}
                  </p>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Apercu de l'activité */}
          <Card>
            <CardHeader>
              <CardTitle>Mon activité</CardTitle>
              <CardDescription>
                Apercu de votre activité telle qu&apos;elle apparait aux utilisateurs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6">
                {/* Image */}
                <div className="w-full md:w-64 h-48 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                  {firstImage ? (
                    <img
                      src={normalizeUploadUrl(firstImage.url)}
                      alt={activity.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl bg-gray-100">
                      {typeInfo?.emoji || "🎯"}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">
                        {typeInfo?.emoji} {typeInfo?.label}
                      </Badge>
                      <Badge variant={activity.status === "PUBLISHED" ? "default" : "outline"}>
                        {activity.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                      </Badge>
                    </div>
                    <h3 className="text-xl font-semibold">{activity.title}</h3>
                    <p className="text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-4 w-4" />
                      {activity.address}, {activity.zipCode} {activity.city}
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {activity.description}
                  </p>

                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {activity.priceFrom && (
                      <span>A partir de {activity.priceFrom}€</span>
                    )}
                    {activity.durationMinutes && (
                      <span>• {activity.durationMinutes} min</span>
                    )}
                    {activity.maxPeople && (
                      <span>• Jusqu&apos;a {activity.maxPeople} personnes</span>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button asChild>
                      <Link href={`/etablissement/activites/${activity.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Modifier l&apos;activité
                      </Link>
                    </Button>
                    <ActivityActions activity={activity} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions rapides */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
              <Link href={`/etablissement/activites/${activity.id}`}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Gérer les médias
                  </CardTitle>
                  <CardDescription>
                    Ajoutez ou modifiez les images et vidéos de votre activité
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {activity.medias.filter(m => m.kind === "IMAGE").length} image(s) •
                    {activity.medias.some(m => m.kind === "VIDEO_UPLOAD" || m.kind === "VIDEO")
                      ? " 1 vidéo"
                      : " Aucune vidéo"}
                  </p>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
              <Link href={`/activite/${activity.id}`} target="_blank">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ExternalLink className="h-5 w-5" />
                    Voir la page publique
                  </CardTitle>
                  <CardDescription>
                    Visualisez votre activité telle que les utilisateurs la voient
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Ouvre dans un nouvel onglet
                  </p>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Verification Status */}
          <Card className={
            establishment?.verifiedAt
              ? "border-blue-200 bg-blue-50"
              : "hover:bg-gray-50 transition-colors"
          }>
            <Link href="/etablissement/verification">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {establishment?.verifiedAt ? (
                    <>
                      <BadgeCheck className="h-5 w-5 text-blue-600" />
                      Etablissement verifie
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      Verification
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {establishment?.verifiedAt
                    ? `Verifie le ${new Date(establishment.verifiedAt).toLocaleDateString("fr-FR")}`
                    : "Faites verifier votre etablissement pour obtenir le badge de confiance"}
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>

          {/* Detailed Analytics */}
          <AnalyticsCard activityId={activity.id} />
        </>
      ) : (
        /* No activity - prompt to create */
        <Card>
          <CardHeader>
            <CardTitle>Bienvenue sur votre espace établissement</CardTitle>
            <CardDescription>
              Créez votre activité pour apparaitre dans les recherches des utilisateurs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold mb-2">
                Configurez votre activité
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Décrivez votre activité, ajoutez des photos et une vidéo,
                définissez vos tarifs et horaires pour attirer de nouveaux clients.
              </p>
              <Button size="lg" asChild>
                <Link href="/etablissement/activites/nouvelle">
                  <Plus className="mr-2 h-5 w-5" />
                  Créer mon activité
                </Link>
              </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center p-4">
                <div className="text-2xl mb-2">📸</div>
                <h4 className="font-medium">Photos & Vidéos</h4>
                <p className="text-sm text-muted-foreground">
                  Mettez en valeur votre établissement
                </p>
              </div>
              <div className="text-center p-4">
                <div className="text-2xl mb-2">📍</div>
                <h4 className="font-medium">Localisation</h4>
                <p className="text-sm text-muted-foreground">
                  Apparaissez sur la carte interactive
                </p>
              </div>
              <div className="text-center p-4">
                <div className="text-2xl mb-2">⭐</div>
                <h4 className="font-medium">Visibilité</h4>
                <p className="text-sm text-muted-foreground">
                  Soyez trouvé par de nouveaux clients
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
