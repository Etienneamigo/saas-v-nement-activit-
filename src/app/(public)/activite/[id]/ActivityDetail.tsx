"use client"

import { useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { ACTIVITY_TYPES, ActivityTypeKey } from "@/lib/constants"
import { toggleFavorite } from "@/app/actions/favorites"
import { toast } from "sonner"
import {
  MapPin,
  Clock,
  Euro,
  Users,
  Heart,
  Navigation,
  Phone,
  Globe,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  Play,
  ChevronDown,
  BadgeCheck,
  Accessibility,
  ParkingSquare,
  ArrowUpDown,
  DoorOpen,
} from "lucide-react"
import type { Activity, Media, Establishment, Event, ReservationSettings, WeeklySchedule, ReservationCustomFieldDef } from "@prisma/client"
import { EventsCarousel } from "./EventsCarousel"
import { BookingWidget } from "./BookingWidget"
import { MediaGrid } from "./MediaGrid"
import { StreamHlsVideo } from "@/components/video/StreamHlsVideo"
import { normalizeUploadUrl, isHlsUrl } from "@/lib/video-utils"

const ActivityMap = dynamic(
  () => import("@/components/map/ActivityMap").then((mod) => mod.ActivityMap),
  { ssr: false, loading: () => <div className="h-64 bg-gray-100 rounded-lg animate-pulse" /> }
)

type ReservationSettingsWithRelations = ReservationSettings & {
  weeklySchedule: WeeklySchedule[]
  customFieldDefs: ReservationCustomFieldDef[]
}

interface ActivityDetailProps {
  activity: Activity & {
    medias: Media[]
    establishment: Establishment
    events: Event[]
    _count: { favorites: number }
  }
  isFavorited: boolean
  isAuthenticated: boolean
  userId?: string
  reservationSettings?: ReservationSettingsWithRelations | null
}

export function ActivityDetail({
  activity,
  isFavorited: initialFavorited,
  isAuthenticated,
  reservationSettings,
}: ActivityDetailProps) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited)
  const [isLoading, setIsLoading] = useState(false)
  const [visibleMediaCount, setVisibleMediaCount] = useState(9)

  const typeInfo = ACTIVITY_TYPES[activity.type as ActivityTypeKey]

  // Medias are already sorted DESC by createdAt from the server
  const allMedia = activity.medias

  // Cover: use explicit coverMediaId if set, otherwise first media (= most recent)
  const coverMediaId = (activity as Activity & { coverMediaId?: string | null }).coverMediaId
  const coverMedia = coverMediaId
    ? allMedia.find((m) => m.id === coverMediaId) || allMedia[0]
    : allMedia[0]
  const coverIsVideo = coverMedia?.kind === "VIDEO_UPLOAD" || coverMedia?.kind === "VIDEO"

  // Grid medias (exclude cover to avoid duplication)
  const gridMedia = coverMedia
    ? allMedia.filter((m) => m.id !== coverMedia.id)
    : allMedia
  const visibleGridMedia = gridMedia.slice(0, visibleMediaCount)
  const hasMoreMedia = gridMedia.length > visibleMediaCount

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${activity.lat},${activity.lng}`
  const osmUrl = `https://www.openstreetmap.org/directions?route=;${activity.lat},${activity.lng}`

  async function handleToggleFavorite() {
    if (!isAuthenticated) {
      toast.error("Connectez-vous pour ajouter aux favoris")
      return
    }

    setIsLoading(true)
    const result = await toggleFavorite(activity.id)
    setIsLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      setIsFavorited(result.isFavorited || false)
      toast.success(
        result.isFavorited ? "Ajouté aux favoris" : "Retiré des favoris"
      )
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/recherche"
          className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Retour
        </Link>
      </div>

      {/* Cover + Title */}
      <div className="relative rounded-xl overflow-hidden mb-4 bg-gray-100">
        {coverMedia ? (
          coverIsVideo ? (
            <div className="aspect-[16/9] sm:aspect-[21/9]">
              {isHlsUrl(coverMedia.url) ? (
                <StreamHlsVideo
                  src={coverMedia.url}
                  poster={coverMedia.thumbnailUrl ? normalizeUploadUrl(coverMedia.thumbnailUrl) : undefined}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <video
                  src={normalizeUploadUrl(coverMedia.url)}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Play className="h-12 w-12 text-white/60" />
              </div>
            </div>
          ) : (
            <div className="aspect-[16/9] sm:aspect-[21/9]">
              <img
                src={normalizeUploadUrl(coverMedia.url)}
                alt={activity.title}
                className="w-full h-full object-cover"
              />
            </div>
          )
        ) : (
          <div className="aspect-[16/9] sm:aspect-[21/9] bg-gradient-to-br from-gray-200 to-gray-100 flex items-center justify-center">
            <span className="text-6xl">{typeInfo?.emoji || "🎯"}</span>
          </div>
        )}
        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
          <p className="text-xs sm:text-sm text-white/70 mb-1">
            {typeInfo?.label || activity.type}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {activity.title}
          </h1>
          <p className="text-white/70 text-sm mt-1 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {activity.address}, {activity.zipCode} {activity.city}
          </p>
        </div>
      </div>

      {/* Centralized CTA row */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {/* Bouton réservation externe :
            - toujours affiché si réservation native désactivée
            - affiché en secondaire si native activée + showExternalLinkAlso */}
        {activity.establishment.bookingUrl && (
          !reservationSettings?.enabled || reservationSettings?.showExternalLinkAlso
        ) && (
          <Button
            asChild
            size="sm"
            className={reservationSettings?.enabled ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" : "bg-gray-900 hover:bg-black text-white"}
            variant={reservationSettings?.enabled ? "outline" : "default"}
          >
            <a href={activity.establishment.bookingUrl} target="_blank" rel="noopener noreferrer">
              <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
              {reservationSettings?.enabled ? "Réserver sur le site officiel" : "Réserver"}
            </a>
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="border-gray-200 text-gray-700">
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="h-3.5 w-3.5 mr-1.5" />
            Itinéraire
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-gray-200 text-gray-700"
          onClick={handleToggleFavorite}
          disabled={isLoading}
        >
          <Heart
            className={`h-3.5 w-3.5 mr-1.5 ${isFavorited ? "fill-current text-red-500" : ""}`}
          />
          {isFavorited ? "Favori" : "Favoris"}
        </Button>
        {activity.establishment.website && (
          <Button asChild variant="outline" size="sm" className="border-gray-200 text-gray-700">
            <a href={activity.establishment.website} target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              Site web
            </a>
          </Button>
        )}
        {activity.establishment.phone && (
          <Button asChild variant="outline" size="sm" className="border-gray-200 text-gray-700">
            <a href={`tel:${activity.establishment.phone}`}>
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              {activity.establishment.phone}
            </a>
          </Button>
        )}
      </div>

      {/* Widget réservation native */}
      {reservationSettings?.enabled && (
        <div className="mb-8">
          <BookingWidget
            establishmentId={activity.establishment.id}
            settings={reservationSettings}
            isAuthenticated={isAuthenticated}
          />
        </div>
      )}

      {/* Description */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Description</h2>
        <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
          {activity.description}
        </p>
      </div>

      {/* Media Grid — cover excluded, 9 initial + 3 per click */}
      {gridMedia.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Médias
            <span className="text-sm font-normal text-gray-400 ml-2">{gridMedia.length}</span>
          </h2>
          <MediaGrid medias={visibleGridMedia} />
          {hasMoreMedia && (
            <button
              onClick={() => setVisibleMediaCount((prev) => prev + 3)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
              Voir plus ({gridMedia.length - visibleMediaCount} restant{gridMedia.length - visibleMediaCount > 1 ? "s" : ""})
            </button>
          )}
        </div>
      )}

      {/* Upcoming Events */}
      {activity.events.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Événements à venir</h2>
          <EventsCarousel events={activity.events} />
        </div>
      )}

      {/* Infos pratiques */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Infos pratiques</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {activity.durationMinutes && (
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Durée</p>
                <p className="text-sm font-medium text-gray-900">{activity.durationMinutes} min</p>
              </div>
            </div>
          )}
          {activity.priceFrom && (
            <div className="flex items-start gap-3">
              <Euro className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Prix</p>
                <p className="text-sm font-medium text-gray-900">Dès {activity.priceFrom}€</p>
              </div>
            </div>
          )}
          {(activity.minPeople || activity.maxPeople) && (
            <div className="flex items-start gap-3">
              <Users className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Personnes</p>
                <p className="text-sm font-medium text-gray-900">
                  {activity.minPeople || 1} - {activity.maxPeople || "∞"}
                </p>
              </div>
            </div>
          )}
        </div>
        {activity.scheduleText && (
          <div className="flex items-start gap-3 mt-4 pt-4 border-t border-gray-100">
            <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-1">Horaires</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.scheduleText}</p>
            </div>
          </div>
        )}
        {activity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-gray-100">
            {activity.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 text-xs text-gray-500 bg-gray-100 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Localisation */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Localisation</h2>
        <div className="h-56 rounded-xl overflow-hidden mb-3 border border-gray-100">
          <ActivityMap
            activities={[{ ...activity, _count: { favorites: 0 } } as never]}
            center={{ lat: activity.lat, lng: activity.lng }}
          />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="text-xs border-gray-200">
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              Google Maps
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="text-xs border-gray-200">
            <a href={osmUrl} target="_blank" rel="noopener noreferrer">
              OpenStreetMap
            </a>
          </Button>
        </div>
      </div>

      {/* Accessibilité */}
      {(() => {
        const est = activity.establishment as Establishment & {
          accessWheelchair?: boolean
          accessToilets?: boolean
          accessParking?: boolean
          accessElevator?: boolean
          accessLevelEntry?: boolean
        }
        const badges = [
          { key: "accessWheelchair", label: "Accessible PMR",         icon: <Accessibility className="h-3.5 w-3.5" /> },
          { key: "accessToilets",    label: "Toilettes accessibles",   icon: <DoorOpen className="h-3.5 w-3.5" /> },
          { key: "accessParking",    label: "Parking PMR",             icon: <ParkingSquare className="h-3.5 w-3.5" /> },
          { key: "accessElevator",   label: "Ascenseur",               icon: <ArrowUpDown className="h-3.5 w-3.5" /> },
          { key: "accessLevelEntry", label: "Accès plain-pied",        icon: <DoorOpen className="h-3.5 w-3.5" /> },
        ] as const
        const activeBadges = badges.filter(({ key }) => est[key])
        if (activeBadges.length === 0) return null
        return (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Accessibilité</h2>
            <div className="flex flex-wrap gap-2">
              {activeBadges.map(({ key, label, icon }) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full"
                >
                  {icon}
                  {label}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Établissement */}
      <div className="mb-10 p-5 bg-gray-50 rounded-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Établissement</h2>
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{activity.establishment.name}</p>
          {activity.establishment.verifiedAt && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              <BadgeCheck className="h-3.5 w-3.5" />
              Verifie
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
