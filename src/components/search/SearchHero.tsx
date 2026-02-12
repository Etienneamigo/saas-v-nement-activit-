"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ACTIVITY_TYPE_OPTIONS_PLAIN } from "@/lib/constants"
import { MapPin, Search, Navigation, Loader2, RefreshCw } from "lucide-react"
import { useGeolocation } from "@/components/providers/GeolocationProvider"

interface ActivityTypeOption {
  value: string
  label: string
  emoji?: string
  iconUrl?: string | null
}

interface SearchHeroProps {
  /** Activity type options from DB (with emojis for the grid, plain for dropdown) */
  activityTypeOptions?: ActivityTypeOption[]
  /** Whether this is rendered inside a hero section with background media */
  hasBackground?: boolean
  /** Optional initial city value */
  initialCity?: string
  /** Optional initial type value */
  initialType?: string
}

export function SearchHero({
  activityTypeOptions,
  hasBackground = false,
  initialCity = "",
  initialType = "",
}: SearchHeroProps) {
  const router = useRouter()
  const { location, isGeolocating, error: geoError, requestGeolocation, clearLocation } = useGeolocation()

  const [city, setCity] = useState(initialCity)
  const [type, setType] = useState(initialType)
  const pathname = usePathname()
  const prevLocationRef = useRef(location)

  // When geolocation succeeds, clear city and auto-trigger search on search page
  useEffect(() => {
    const wasNull = prevLocationRef.current === null
    prevLocationRef.current = location

    if (location && wasNull) {
      // Geolocation just succeeded — clear city/postalCode
      setCity("")

      // If we're on the search page, auto-navigate to refresh results with geo coords only
      if (pathname === "/recherche") {
        const params = new URLSearchParams()
        params.set("lat", location.lat.toString())
        params.set("lng", location.lng.toString())
        if (type && type !== "all") params.set("type", type)
        params.set("radius", "20")
        router.push(`/recherche?${params.toString()}`)
      }
    }
  }, [location, pathname, type, router])

  const dropdownOptions = activityTypeOptions && activityTypeOptions.length > 0
    ? activityTypeOptions.map((o) => ({ value: o.value, label: o.label }))
    : ACTIVITY_TYPE_OPTIONS_PLAIN

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()

    const params = new URLSearchParams()

    if (location) {
      params.set("lat", location.lat.toString())
      params.set("lng", location.lng.toString())
    } else if (city) {
      params.set("city", city)
    }

    if (type && type !== "all") {
      params.set("type", type)
    }

    params.set("radius", "20")

    router.push(`/recherche?${params.toString()}`)
  }

  return (
    <div className={`max-w-3xl mx-auto ${hasBackground ? "bg-white rounded-xl shadow-lg p-4 md:p-5" : ""}`}>
      <form onSubmit={handleSearch}>
        <div className="flex flex-col sm:flex-row gap-2">
          {/* City input + geolocation button */}
          <div className="flex gap-2 sm:contents">
            <div className="relative flex-1 min-w-0 sm:flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Ville ou code postal"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value)
                  if (location) clearLocation()
                }}
                disabled={!!location}
                className="pl-9 h-10 text-sm bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
              />
            </div>

            {/* Geolocation button — adapts based on state */}
            {location ? (
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearLocation}
                  className="h-10 px-3 border-green-200 text-green-700 bg-green-50 shrink-0"
                  title="Changer de localisation"
                >
                  <Navigation className="h-4 w-4" />
                  <span className="ml-1.5 text-sm truncate max-w-24">
                    {location.cityName || "Localisé"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={requestGeolocation}
                  className="h-10 w-10 p-0 shrink-0"
                  title="Actualiser la position"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestGeolocation}
                disabled={isGeolocating}
                className="h-10 px-3 border-gray-200 text-gray-600 shrink-0 flex-1 sm:flex-none sm:w-auto"
              >
                {isGeolocating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4" />
                )}
                <span className="ml-1.5 text-sm">Me localiser</span>
              </Button>
            )}
          </div>

          {/* Type */}
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 text-sm border-gray-200 sm:w-44 w-full">
              <SelectValue placeholder="Type d'activité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {dropdownOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Submit */}
          <Button type="submit" className="h-10 px-5 shrink-0 sm:w-auto w-full">
            <Search className="h-4 w-4 mr-1.5" />
            Rechercher
          </Button>
        </div>

        {geoError && (
          <p className="text-xs text-red-500 mt-1.5 ml-1">{geoError}</p>
        )}
      </form>
    </div>
  )
}
