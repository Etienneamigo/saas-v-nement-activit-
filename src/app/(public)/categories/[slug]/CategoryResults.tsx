"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { searchByCategory, type ActivityWithDistance } from "@/app/actions/categories"
import { geocodeCity } from "@/app/actions/search"
import { ACTIVITY_TYPES, type ActivityTypeKey } from "@/lib/constants"
import { formatDistance } from "@/lib/geo"
import { MapPin, Clock, Euro, Users, Search, Navigation, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { FeedFavoriteButton } from "@/components/FeedFavoriteButton"

// Normalize upload URLs
function normalizeUploadUrl(url: string): string {
  if (url.startsWith("/uploads/")) {
    return url.replace("/uploads/", "/api/uploads/")
  }
  return url
}

interface CategoryResultsProps {
  slug: string
  label: string
  searchParams: {
    city?: string
    lat?: string
    lng?: string
    radius?: string
  }
  isAuthenticated?: boolean
  initialFavoritedIds?: string[]
}

export function CategoryResults({ slug, label, searchParams, isAuthenticated = false, initialFavoritedIds = [] }: CategoryResultsProps) {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityWithDistance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [city, setCity] = useState(searchParams.city || "")
  const [isGeolocating, setIsGeolocating] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    searchParams.lat && searchParams.lng
      ? { lat: parseFloat(searchParams.lat), lng: parseFloat(searchParams.lng) }
      : null
  )

  const fetchResults = useCallback(async () => {
    setIsLoading(true)

    let lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
    let lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

    if (!lat && !lng && searchParams.city) {
      const coords = await geocodeCity(searchParams.city)
      if (coords) {
        lat = coords.lat
        lng = coords.lng
      }
    }

    const result = await searchByCategory({
      slug,
      city: searchParams.city,
      lat,
      lng,
      radius: searchParams.radius ? parseInt(searchParams.radius) : 20,
    })

    setActivities(result.activities)
    setTotal(result.total)
    setIsLoading(false)
  }, [slug, searchParams])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  function handleGeolocation() {
    if (!navigator.geolocation) return
    setIsGeolocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude }
        setUserLocation(loc)
        setIsGeolocating(false)
        setCity("")
        // Navigate with geo params
        const params = new URLSearchParams()
        params.set("lat", loc.lat.toString())
        params.set("lng", loc.lng.toString())
        router.push(`/categories/${slug}?${params.toString()}`)
      },
      () => {
        setIsGeolocating(false)
      }
    )
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (userLocation) {
      params.set("lat", userLocation.lat.toString())
      params.set("lng", userLocation.lng.toString())
    } else if (city) {
      params.set("city", city)
    }
    router.push(`/categories/${slug}?${params.toString()}`)
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back + title */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{label}</h1>
      </div>

      {/* Search bar with geolocation */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Ville ou code postal"
              value={city}
              onChange={(e) => {
                setCity(e.target.value)
                setUserLocation(null)
              }}
              className="pl-9 h-10 text-sm border-gray-200"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGeolocation}
            disabled={isGeolocating}
            className="h-10 px-3 border-gray-200 text-gray-600 shrink-0"
          >
            {isGeolocating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            <span className="ml-1.5 text-sm hidden sm:inline">
              {userLocation ? "Localisé" : "Me localiser"}
            </span>
          </Button>
          <Button type="submit" size="sm" className="h-10 px-4 shrink-0">
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {userLocation && (
          <p className="text-xs text-green-600 mt-1.5 ml-1">Position détectée</p>
        )}
      </form>

      {/* Results */}
      {isLoading ? (
        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-4 py-4 px-2">
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-gray-100 rounded w-20 animate-pulse" />
                <div className="h-4 bg-gray-100 rounded w-48 animate-pulse" />
                <div className="h-3 bg-gray-100 rounded w-32 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-400 text-sm">Aucune activité trouvée</p>
          <p className="text-gray-400 text-xs mt-1">
            Essayez d&apos;élargir votre recherche
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-2">
            {total} résultat{total > 1 ? "s" : ""}
          </p>
          <div className="divide-y divide-gray-100">
            {activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                isAuthenticated={isAuthenticated}
                isFavorited={initialFavoritedIds.includes(activity.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ActivityCard({ activity, isAuthenticated, isFavorited }: { activity: ActivityWithDistance; isAuthenticated: boolean; isFavorited: boolean }) {
  const typeInfo = ACTIVITY_TYPES[activity.type as ActivityTypeKey]
  const firstImage = activity.medias.find((m) => m.kind === "IMAGE")

  return (
    <Link href={`/activite/${activity.id}`}>
      <div className="flex items-start gap-4 py-4 px-2 hover:bg-gray-50/70 transition-colors cursor-pointer group">
        {/* Thumbnail */}
        <div className="w-18 h-18 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
          {firstImage ? (
            <img
              src={normalizeUploadUrl(firstImage.url)}
              alt={activity.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl bg-gray-50">
              {typeInfo?.emoji || "🎯"}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-xs text-gray-400 mb-0.5">
            {typeInfo?.label || activity.type}
          </p>
          <h3 className="font-semibold text-[15px] text-gray-900 line-clamp-1 group-hover:text-black">
            {activity.title}
          </h3>
          <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
            {activity.description}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {activity.city}
            </span>
            {activity.distance !== undefined && (
              <span className="font-medium text-gray-600">
                {formatDistance(activity.distance)}
              </span>
            )}
            {activity.durationMinutes && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {activity.durationMinutes} min
              </span>
            )}
            {activity.priceFrom && (
              <span className="inline-flex items-center gap-1">
                <Euro className="h-3 w-3" />
                dès {activity.priceFrom}€
              </span>
            )}
            {(activity.minPeople || activity.maxPeople) && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {activity.minPeople || 1}-{activity.maxPeople || "∞"}
              </span>
            )}
          </div>
        </div>

        {/* Favorite + Arrow */}
        <div className="flex items-center gap-1 mt-2 flex-shrink-0">
          <FeedFavoriteButton
            activityId={activity.id}
            initialFavorited={isFavorited}
            isAuthenticated={isAuthenticated}
          />
          <ChevronRight className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  )
}
