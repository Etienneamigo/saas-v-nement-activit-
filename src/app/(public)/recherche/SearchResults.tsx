"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { searchActivities, geocodeCity, ActivityWithDistance } from "@/app/actions/search"
import { trackImpressions } from "@/app/actions/analytics"
import { ACTIVITY_TYPE_OPTIONS_PLAIN, DISTANCE_OPTIONS, ACTIVITY_TYPES, ActivityTypeKey } from "@/lib/constants"
import { formatDistance } from "@/lib/geo"
import { useGeolocation } from "@/components/providers/GeolocationProvider"
import { MapPin, Clock, Euro, Users, Search, SlidersHorizontal, List, Map as MapIcon, ChevronRight } from "lucide-react"

// Dynamic import for the map to avoid SSR issues
const ActivityMap = dynamic(
  () => import("@/components/map/ActivityMap").then((mod) => mod.ActivityMap),
  { ssr: false, loading: () => <div className="h-96 bg-gray-100 rounded-lg animate-pulse" /> }
)

interface SearchResultsProps {
  params: {
    lat?: string
    lng?: string
    city?: string
    type?: string
    radius?: string
    minPeople?: string
    maxPeople?: string
    priceMax?: string
    sortBy?: string
    page?: string
  }
}

// Get or create a session ID for anonymous analytics tracking
function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return ""

  let sessionId = localStorage.getItem("analytics_session_id")
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    localStorage.setItem("analytics_session_id", sessionId)
  }
  return sessionId
}

// Normalize upload URLs to use API route for proper MIME type handling
function normalizeUploadUrl(url: string): string {
  if (url.startsWith("/uploads/")) {
    return url.replace("/uploads/", "/api/uploads/")
  }
  return url
}

export function SearchResults({ params }: SearchResultsProps) {
  const router = useRouter()
  const resultsRef = useRef<HTMLDivElement>(null)
  const { location: geoLocation } = useGeolocation()
  const [activities, setActivities] = useState<ActivityWithDistance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<"list" | "map">("list")
  const [center, setCenter] = useState<{ lat: number; lng: number } | undefined>()
  const [sessionId, setSessionId] = useState<string>("")

  // Initialize session ID on client
  useEffect(() => {
    setSessionId(getOrCreateSessionId())
  }, [])

  // Filter states
  const [city, setCity] = useState(params.city || "")
  const [type, setType] = useState(params.type || "")
  const [radius, setRadius] = useState(params.radius || "10")
  const [minPeople, setMinPeople] = useState(params.minPeople || "")
  const [maxPeople, setMaxPeople] = useState(params.maxPeople || "")
  const [priceMax, setPriceMax] = useState(params.priceMax || "")
  const [sortBy, setSortBy] = useState(params.sortBy || "distance")

  // Sync city filter state when URL params change (e.g. after geolocation clears city)
  useEffect(() => {
    setCity(params.city || "")
  }, [params.city])

  const fetchActivities = useCallback(async () => {
    setIsLoading(true)

    let lat: number | undefined
    let lng: number | undefined

    // Priority for coordinate source:
    // 1. If city/CP is used, geocode it for consistent distance calculation
    // 2. If lat/lng from URL (geo mode), use those
    // 3. Fall back to persisted geolocation from context
    if (params.city) {
      const coords = await geocodeCity(params.city)
      if (coords) {
        lat = coords.lat
        lng = coords.lng
      }
    } else if (params.lat && params.lng) {
      lat = parseFloat(params.lat)
      lng = parseFloat(params.lng)
    } else if (geoLocation) {
      lat = geoLocation.lat
      lng = geoLocation.lng
    }

    if (lat && lng) {
      setCenter({ lat, lng })
    }

    // When we have coordinates from city geocoding, don't also filter by city name
    // (the radius filter is sufficient and avoids excluding nearby activities
    // in neighboring communes)
    const cityFilter = (lat !== undefined && lng !== undefined) ? undefined : params.city

    const result = await searchActivities({
      lat,
      lng,
      city: cityFilter,
      type: params.type,
      radius: params.radius ? parseInt(params.radius) : 10,
      minPeople: params.minPeople ? parseInt(params.minPeople) : undefined,
      maxPeople: params.maxPeople ? parseInt(params.maxPeople) : undefined,
      priceMax: params.priceMax ? parseFloat(params.priceMax) : undefined,
      sortBy: (params.sortBy as "distance" | "popularity") || "distance",
      page: params.page ? parseInt(params.page) : 1,
    })

    setActivities(result.activities)
    setTotal(result.total)
    setIsLoading(false)
  }, [params, geoLocation])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // Track impressions when activities are displayed
  useEffect(() => {
    if (activities.length > 0 && sessionId) {
      const activityIds = activities.map(a => a.id)
      trackImpressions(activityIds, sessionId)
    }
  }, [activities, sessionId])

  function handleSearch() {
    const searchParams = new URLSearchParams()

    // Don't mix geo coords with city filter — use one or the other
    if (city) {
      searchParams.set("city", city)
    } else if (params.lat && params.lng) {
      searchParams.set("lat", params.lat)
      searchParams.set("lng", params.lng)
    }

    if (type && type !== "all") searchParams.set("type", type)
    if (radius) searchParams.set("radius", radius)
    if (minPeople) searchParams.set("minPeople", minPeople)
    if (maxPeople) searchParams.set("maxPeople", maxPeople)
    if (priceMax) searchParams.set("priceMax", priceMax)
    if (sortBy) searchParams.set("sortBy", sortBy)

    // Close filters panel on mobile after search
    setShowFilters(false)

    router.push(`/recherche?${searchParams.toString()}`)

    // Smooth scroll to results after a short delay (for mobile UX)
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  function handleActivityClick(id: string) {
    router.push(`/activite/${id}`)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-5 border-b border-gray-100">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {isLoading ? "Recherche..." : `${total} résultat${total > 1 ? "s" : ""}`}
          </h1>
          {params.city && (
            <p className="text-sm text-gray-500 mt-0.5">{params.city}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
              showFilters
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtres
          </button>
          <div className="flex border border-gray-200 rounded-full overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === "list" ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:text-gray-700"
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === "map" ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:text-gray-700"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="py-4 border-b border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ville</label>
              <Input
                placeholder="Paris, Lyon..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-sm border-gray-200">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les activités</SelectItem>
                  {ACTIVITY_TYPE_OPTIONS_PLAIN.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rayon</label>
              <Select value={radius} onValueChange={setRadius}>
                <SelectTrigger className="h-9 text-sm border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISTANCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tri</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-9 text-sm border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="distance">Distance</SelectItem>
                  <SelectItem value="popularity">Popularité</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Min pers.</label>
              <Input
                type="number"
                min="1"
                placeholder="1"
                value={minPeople}
                onChange={(e) => setMinPeople(e.target.value)}
                className="h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Max pers.</label>
              <Input
                type="number"
                min="1"
                placeholder="10"
                value={maxPeople}
                onChange={(e) => setMaxPeople(e.target.value)}
                className="h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Prix max</label>
              <Input
                type="number"
                min="0"
                placeholder="50€"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                className="h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
              />
            </div>

            <div className="flex items-end">
              <Button onClick={handleSearch} size="sm" className="w-full h-9">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Rechercher
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div ref={resultsRef}>
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
            Essayez d&apos;élargir votre recherche ou de modifier les filtres
          </p>
        </div>
      ) : viewMode === "map" ? (
        <div className="h-[600px] rounded-xl overflow-hidden border border-gray-100 mt-4">
          <ActivityMap
            activities={activities}
            center={center}
            onActivityClick={handleActivityClick}
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-0">
          {/* Activity List */}
          <div className="divide-y divide-gray-100">
            {activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>

          {/* Map (desktop only) */}
          <div className="hidden lg:block sticky top-20 h-[calc(100vh-6rem)] pl-6">
            <div className="h-full rounded-xl overflow-hidden border border-gray-100">
              <ActivityMap
                activities={activities}
                center={center}
                onActivityClick={handleActivityClick}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function ActivityCard({ activity }: { activity: ActivityWithDistance }) {
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

        {/* Arrow */}
        <ChevronRight className="h-4 w-4 text-gray-300 mt-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  )
}
