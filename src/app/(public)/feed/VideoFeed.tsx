"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DISTANCE_OPTIONS } from "@/lib/constants"
import {
  MapPin,
  Navigation,
  Loader2,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from "lucide-react"
import { StreamHlsVideo } from "@/components/video/StreamHlsVideo"
import { isHlsUrl } from "@/lib/video-utils"
import { FavoriteButton } from "@/components/FavoriteButton"

interface FeedVideo {
  id: string
  url: string
  kind: string
  title: string | null
  videoCategory: string | null
  thumbnailUrl: string | null
  duration: number | null
  fileName: string | null
  createdAt: string
  activity: {
    id: string
    title: string
    type: string
    city: string
    lat: number
    lng: number
  }
  establishment: {
    id: string
    name: string
    city: string | null
  }
}

interface VideoFeedProps {
  isAuthenticated?: boolean
  /** IDs des activités déjà en favoris (pré-chargé SSR pour éviter le flicker) */
  favoritedActivityIds?: string[]
}

export function VideoFeed({ isAuthenticated = false, favoritedActivityIds = [] }: VideoFeedProps) {
  const router = useRouter()
  const [videos, setVideos] = useState<FeedVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [seed, setSeed] = useState<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState(true)
  const [radius, setRadius] = useState("50")
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isGeolocating, setIsGeolocating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  // Source de vérité locale des favoris (initialisée SSR, mise à jour à chaque toggle)
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(
    () => new Set(favoritedActivityIds)
  )

  const fetchVideos = useCallback(async (reset = false) => {
    setIsLoading(true)

    const params = new URLSearchParams()
    params.set("limit", "10")

    if (!reset && cursor) {
      params.set("cursor", cursor)
    }
    if (seed && !reset) {
      params.set("seed", seed.toString())
    }
    if (userLocation) {
      params.set("lat", userLocation.lat.toString())
      params.set("lng", userLocation.lng.toString())
      params.set("radius", radius)
    }

    try {
      const res = await fetch(`/api/feed/videos?${params.toString()}`)
      const data = await res.json()

      if (reset) {
        setVideos(data.videos)
        setCurrentIndex(0)
      } else {
        setVideos((prev) => [...prev, ...data.videos])
      }

      setCursor(data.nextCursor)
      setSeed(data.seed)
      setHasMore(data.hasMore)
    } catch (error) {
      console.error("Error fetching videos:", error)
    } finally {
      setIsLoading(false)
    }
  }, [cursor, seed, userLocation, radius])

  // Initial fetch
  useEffect(() => {
    fetchVideos(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, radius])

  // Auto-play current video and pause others.
  // Include videos.length so this also fires when the first batch of videos arrives
  // (currentIndex stays 0 on initial load, so without this dependency the effect
  // would not re-run and the first video would never autoplay).
  useEffect(() => {
    if (videos.length === 0) return
    videoRefs.current.forEach((video, index) => {
      if (index === currentIndex) {
        video.play().catch(() => {})
      } else {
        video.pause()
        video.currentTime = 0
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, videos.length])

  // Load more when approaching end
  useEffect(() => {
    if (currentIndex >= videos.length - 3 && hasMore && !isLoading) {
      fetchVideos()
    }
  }, [currentIndex, videos.length, hasMore, isLoading, fetchVideos])

  function handleGeolocation() {
    if (!navigator.geolocation) {
      alert("La geolocalisation n'est pas supportee par votre navigateur")
      return
    }

    setIsGeolocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setIsGeolocating(false)
      },
      () => {
        alert("Impossible d'obtenir votre position")
        setIsGeolocating(false)
      }
    )
  }

  function goToVideo(index: number) {
    if (index >= 0 && index < videos.length) {
      setCurrentIndex(index)
      const container = containerRef.current
      if (container) {
        const videoEl = container.children[index] as HTMLElement
        videoEl?.scrollIntoView({ behavior: "smooth" })
      }
    }
  }

  function handleScroll() {
    const container = containerRef.current
    if (!container) return

    const scrollTop = container.scrollTop
    const videoHeight = container.clientHeight
    const newIndex = Math.round(scrollTop / videoHeight)

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < videos.length) {
      setCurrentIndex(newIndex)
    }
  }

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        goToVideo(currentIndex + 1)
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        goToVideo(currentIndex - 1)
      } else if (e.key === "m") {
        toggleMute()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Apply mute state to all videos (fallback for newly added video elements)
  useEffect(() => {
    videoRefs.current.forEach((video) => {
      video.muted = isMuted
    })
  }, [isMuted, videos.length])

  // Toggle mute with immediate imperative update (preserves user gesture context
  // required by browser autoplay policies for audio playback)
  function toggleMute() {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    videoRefs.current.forEach((video) => {
      video.muted = newMuted
    })
  }

  if (isLoading && videos.length === 0) {
    return (
      <div className="flex items-center justify-center feed-height">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Chargement du feed...</p>
        </div>
      </div>
    )
  }

  if (!isLoading && videos.length === 0) {
    return (
      <div className="flex items-center justify-center feed-height">
        <div className="text-center space-y-4 max-w-md mx-auto px-4">
          <p className="text-xl font-bold">Aucune video disponible</p>
          <p className="text-muted-foreground">
            Les etablissements n&apos;ont pas encore ajoute de videos.
            {userLocation && " Essayez d'elargir le rayon de recherche."}
          </p>
          {!userLocation && (
            <Button onClick={handleGeolocation} disabled={isGeolocating}>
              <Navigation className="h-4 w-4 mr-2" />
              Filtrer par position
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative feed-height">
      {/* Filters overlay — respects safe-area-inset-top */}
      <div
        className="absolute left-4 right-4 z-20 flex items-center justify-between pointer-events-none"
        style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            variant="secondary"
            size="sm"
            className="bg-black/50 text-white hover:bg-black/70 border-0"
            onClick={handleGeolocation}
            disabled={isGeolocating}
          >
            {isGeolocating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            <span className="ml-1 hidden sm:inline">
              {userLocation ? "Localise" : "Localiser"}
            </span>
          </Button>
          {userLocation && (
            <Select value={radius} onValueChange={setRadius}>
              <SelectTrigger className="w-24 bg-black/50 text-white border-0 h-8 text-sm">
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
          )}
        </div>

        <div className="pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            className="bg-black/50 text-white hover:bg-black/70 border-0 h-8 w-8"
            onClick={toggleMute}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Navigation buttons — centered vertically, safe right inset */}
      <div
        className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2"
        style={{ right: "calc(1rem + env(safe-area-inset-right, 0px))" }}
      >
        <Button
          variant="secondary"
          size="icon"
          className="bg-black/50 text-white hover:bg-black/70 border-0 h-10 w-10 rounded-full"
          onClick={() => goToVideo(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          <ChevronUp className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-black/50 text-white hover:bg-black/70 border-0 h-10 w-10 rounded-full"
          onClick={() => goToVideo(currentIndex + 1)}
          disabled={currentIndex >= videos.length - 1}
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>

      {/* Video container */}
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {videos.map((video, index) => (
          <div
            key={video.id}
            className="h-full snap-start relative flex items-center justify-center bg-black"
          >
            {isHlsUrl(video.url) ? (
              <StreamHlsVideo
                ref={(el) => {
                  if (el) videoRefs.current.set(index, el)
                }}
                src={video.url}
                poster={video.thumbnailUrl || undefined}
                className="h-full w-full object-contain"
                loop
                playsInline
                muted={isMuted}
                preload={Math.abs(index - currentIndex) <= 1 ? "auto" : "none"}
              />
            ) : (
              <video
                ref={(el) => {
                  if (el) videoRefs.current.set(index, el)
                }}
                src={video.url}
                className="h-full w-full object-contain"
                loop
                playsInline
                muted={isMuted}
                preload={Math.abs(index - currentIndex) <= 1 ? "auto" : "none"}
              />
            )}

            {/* Video info overlay — sits above bottom nav on mobile */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 sm:p-6"
              style={{ paddingBottom: "1rem" }}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="max-w-lg flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
                      {video.establishment.name}
                    </Badge>
                    {video.videoCategory && (
                      <Badge variant="outline" className="text-white border-white/30 text-xs">
                        {video.videoCategory}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-white text-base sm:text-lg font-bold mb-1 line-clamp-2">
                    {video.title || video.activity.title}
                  </h3>
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <MapPin className="h-3 w-3" />
                    <span>{video.activity.city}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3 bg-white/20 text-white hover:bg-white/30 border-0"
                    onClick={() => router.push(`/activite/${video.activity.id}`)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Voir l&apos;activite
                  </Button>
                </div>

                {/* Bouton favoris — branché sur la source de vérité locale */}
                <div className="flex-shrink-0 pointer-events-auto">
                  <FavoriteButton
                    activityId={video.activity.id}
                    isFavorited={favoritedIds.has(video.activity.id)}
                    isAuthenticated={isAuthenticated}
                    size="md"
                    className="bg-black/40 hover:bg-black/60 text-white hover:text-red-400 border-0 shadow-lg"
                    onToggle={(newState) => {
                      setFavoritedIds((prev) => {
                        const next = new Set(prev)
                        if (newState) {
                          next.add(video.activity.id)
                        } else {
                          next.delete(video.activity.id)
                        }
                        return next
                      })
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading more indicator */}
        {isLoading && videos.length > 0 && (
          <div className="h-full snap-start flex items-center justify-center bg-black">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>

    </div>
  )
}
