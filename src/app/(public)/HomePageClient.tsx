"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ACTIVITY_TYPE_OPTIONS } from "@/lib/constants"
import { MapPin, Clock, Euro, Users, Star, Moon, Award } from "lucide-react"
import { SearchHero } from "@/components/search/SearchHero"
import { useGeolocation } from "@/components/providers/GeolocationProvider"
import { getPopularActivities, getEveningActivities, getAdminPickActivities, type HomeActivity } from "@/app/actions/home-sections"
import { formatDistance } from "@/lib/geo"

interface ActivityTypeOption {
  value: string
  label: string
  emoji?: string
  iconUrl?: string | null
}

interface HomePageClientProps {
  heroVideoDesktopUrl?: string | null
  heroVideoMobileUrl?: string | null
  heroImageDesktopUrl?: string | null
  heroImageMobileUrl?: string | null
  activityTypeOptions?: ActivityTypeOption[]
}

// Normalize upload URLs to use API route for proper MIME type handling
function normalizeUploadUrl(url: string): string {
  if (url.startsWith("/uploads/")) {
    return url.replace("/uploads/", "/api/uploads/")
  }
  return url
}

export function HomePageClient({
  heroVideoDesktopUrl,
  heroVideoMobileUrl,
  heroImageDesktopUrl,
  heroImageMobileUrl,
  activityTypeOptions,
}: HomePageClientProps) {
  const typeOptions = activityTypeOptions && activityTypeOptions.length > 0
    ? activityTypeOptions
    : ACTIVITY_TYPE_OPTIONS
  const router = useRouter()
  const { location } = useGeolocation()
  const [isMobile, setIsMobile] = useState(false)

  // Dynamic sections state
  const [popularActivities, setPopularActivities] = useState<HomeActivity[]>([])
  const [popularCity, setPopularCity] = useState("Marseille")
  const [eveningActivities, setEveningActivities] = useState<HomeActivity[]>([])
  const [adminPickActivities, setAdminPickActivities] = useState<HomeActivity[]>([])
  const [sectionsLoaded, setSectionsLoaded] = useState(false)

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Fetch dynamic sections when location changes
  const fetchSections = useCallback(async () => {
    const locInput = location
      ? { lat: location.lat, lng: location.lng, cityName: location.cityName }
      : undefined

    const [popular, evening, picks] = await Promise.all([
      getPopularActivities(locInput),
      getEveningActivities(locInput),
      getAdminPickActivities(locInput),
    ])

    setPopularActivities(popular.activities)
    setPopularCity(popular.cityName)
    setEveningActivities(evening.activities)
    setAdminPickActivities(picks.activities)
    setSectionsLoaded(true)
  }, [location])

  useEffect(() => {
    fetchSections()
  }, [fetchSections])

  // Determine background media with fallback: video > image > none
  const videoUrl = isMobile ? heroVideoMobileUrl : heroVideoDesktopUrl
  const finalVideoUrl = videoUrl || heroVideoDesktopUrl
  const hasVideo = !!finalVideoUrl

  const imageUrl = isMobile ? heroImageMobileUrl : heroImageDesktopUrl
  const finalImageUrl = imageUrl || heroImageDesktopUrl
  const hasImage = !hasVideo && !!finalImageUrl

  const hasMedia = hasVideo || hasImage

  return (
    <div className="flex flex-col">
      {/* Hero Section — compact */}
      <section className="relative overflow-hidden">
        {/* Background media */}
        {hasVideo && (
          <>
            <video
              key={finalVideoUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            >
              <source src={normalizeUploadUrl(finalVideoUrl!)} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
        {hasImage && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${normalizeUploadUrl(finalImageUrl!)})` }}
            />
            <div className="absolute inset-0 bg-black/30" />
          </>
        )}

        <div className={`relative z-10 ${hasMedia ? "py-12 md:py-20" : "pt-10 pb-8 md:pt-16 md:pb-12"}`}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center mb-6 md:mb-8">
              <h1 className={`text-2xl md:text-4xl font-bold tracking-tight ${hasMedia ? "text-white drop-shadow-md" : "text-gray-900"}`}>
                découvrez quoi faire, simplement
              </h1>
            </div>

            {/* Search form — shared component */}
            <SearchHero
              activityTypeOptions={activityTypeOptions}
              hasBackground={hasMedia}
            />
          </div>
        </div>
      </section>

      {/* Section A: Activités populaires */}
      <HomeSection
        title={`Activités populaires à ${popularCity}`}
        icon={<Star className="h-5 w-5 text-amber-500" />}
        activities={popularActivities}
        loading={!sectionsLoaded}
        emptyMessage="Aucune activité populaire pour le moment"
      />

      {/* Section B: Quoi faire ce soir */}
      <HomeSection
        title="Quoi faire ce soir"
        icon={<Moon className="h-5 w-5 text-indigo-500" />}
        activities={eveningActivities}
        loading={!sectionsLoaded}
        emptyMessage="Pas d'activités de soirée trouvées"
      />

      {/* Section C: Coup de coeur Wadelo */}
      <HomeSection
        title="Coup de coeur Wadelo"
        icon={<Award className="h-5 w-5 text-emerald-500" />}
        activities={adminPickActivities}
        loading={!sectionsLoaded}
        emptyMessage="Bientôt des coups de coeur Wadelo"
      />

      {/* Activity Types Section — existing categories */}
      <section className="py-8 md:py-10 border-t border-gray-100">
        <div className="container mx-auto px-4">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4 md:mb-6">
            Catégories
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
            {typeOptions.map((option) => {
              const opt = option as ActivityTypeOption
              const emoji = opt.emoji || option.label.split(" ")[0]
              const labelText = opt.emoji
                ? option.label.replace(/^[^\s]+\s/, "")
                : option.label.split(" ").slice(1).join(" ")
              return (
                <button
                  key={option.value}
                  onClick={() => router.push(`/recherche?type=${option.value}`)}
                  className="flex flex-col items-center py-3 px-2 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  {opt.iconUrl ? (
                    <img
                      src={normalizeUploadUrl(opt.iconUrl)}
                      alt=""
                      className="h-8 w-8 object-contain mb-1.5"
                    />
                  ) : (
                    <span className="text-2xl mb-1.5">{emoji}</span>
                  )}
                  <span className="text-xs text-gray-600 text-center font-medium leading-tight group-hover:text-gray-900">
                    {labelText}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 md:py-14 border-t border-gray-100">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
              Vous êtes un établissement ?
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Rejoignez notre plateforme et faites découvrir vos activités.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300 text-gray-700"
              onClick={() => router.push("/auth/inscription")}
            >
              Créer un compte établissement
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Activity Card for Home sections ───────────────────────────────────────────

function HomeActivityCard({ activity }: { activity: HomeActivity }) {
  const firstImage = activity.medias[0]

  return (
    <Link
      href={`/activite/${activity.id}`}
      className="flex-shrink-0 w-64 md:w-72 group"
    >
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow h-full">
        {/* Image */}
        <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
          {firstImage ? (
            <img
              src={normalizeUploadUrl(firstImage.url)}
              alt={activity.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl bg-gray-50">
              🎯
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3">
          <h3 className="font-semibold text-sm text-gray-900 line-clamp-1 group-hover:text-black">
            {activity.title}
          </h3>
          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
            {activity.description}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-gray-400">
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {activity.city}
            </span>
            {activity.distance !== undefined && (
              <span className="font-medium text-gray-600">
                {formatDistance(activity.distance)}
              </span>
            )}
            {activity.priceFrom != null && (
              <span className="inline-flex items-center gap-0.5">
                <Euro className="h-3 w-3" />
                dès {activity.priceFrom}€
              </span>
            )}
            {activity.durationMinutes != null && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {activity.durationMinutes} min
              </span>
            )}
            {(activity.minPeople || activity.maxPeople) && (
              <span className="inline-flex items-center gap-0.5">
                <Users className="h-3 w-3" />
                {activity.minPeople || 1}-{activity.maxPeople || "∞"}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Reusable horizontal section ────────────────────────────────────────────────

function HomeSection({
  title,
  icon,
  activities,
  loading,
  emptyMessage,
}: {
  title: string
  icon: React.ReactNode
  activities: HomeActivity[]
  loading: boolean
  emptyMessage: string
}) {
  if (!loading && activities.length === 0) return null

  return (
    <section className="py-6 md:py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          {icon}
          <h2 className="text-base md:text-lg font-semibold text-gray-900">
            {title}
          </h2>
        </div>

        {loading ? (
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-shrink-0 w-64 md:w-72">
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
            {activities.map((activity) => (
              <HomeActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
