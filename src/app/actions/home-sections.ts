"use server"

import { prisma } from "@/lib/db"
import { calculateDistance } from "@/lib/geo"
import type { Activity, Media } from "@prisma/client"

// Marseille fallback coordinates
const MARSEILLE = { lat: 43.2965, lng: 5.3698, cityName: "Marseille" }

const PROGRESSIVE_RADII = [5, 10, 20, 35, 50]
const DEFAULT_LIMIT = 10

export type HomeActivity = Activity & {
  medias: Media[]
  _count: { favorites: number }
  distance?: number
}

interface LocationInput {
  lat?: number
  lng?: number
  cityName?: string
}

/**
 * Fetch activities with progressive radius expansion.
 * Starts at 5km and widens until we have enough results or hit 50km.
 */
async function fetchWithProgressiveRadius(
  where: Record<string, unknown>,
  location: { lat: number; lng: number },
  limit: number,
  sortFn: (a: HomeActivity, b: HomeActivity) => number
): Promise<HomeActivity[]> {
  // Fetch all published activities matching the base filter in one query
  const allActivities = await prisma.activity.findMany({
    where: { ...where, status: "PUBLISHED" },
    include: {
      medias: { where: { kind: "IMAGE" }, take: 1, orderBy: { sortOrder: "asc" } },
      _count: { select: { favorites: true } },
    },
  }) as HomeActivity[]

  // Calculate distances
  const withDistance = allActivities.map((a) => ({
    ...a,
    distance: calculateDistance(location.lat, location.lng, a.lat, a.lng),
  }))

  // Progressive radius: try each radius until we have enough
  for (const radius of PROGRESSIVE_RADII) {
    const inRadius = withDistance.filter((a) => (a.distance ?? Infinity) <= radius)
    if (inRadius.length >= limit) {
      return inRadius.sort(sortFn).slice(0, limit)
    }
  }

  // If still not enough after max radius, return what we have
  return withDistance
    .filter((a) => (a.distance ?? Infinity) <= PROGRESSIVE_RADII[PROGRESSIVE_RADII.length - 1])
    .sort(sortFn)
    .slice(0, limit)
}

/**
 * Section A: "Activités populaires à <Ville>"
 * Sorted by favorites count (descending), tie-break by distance.
 */
export async function getPopularActivities(
  input?: LocationInput,
  limit: number = DEFAULT_LIMIT
): Promise<{ activities: HomeActivity[]; cityName: string }> {
  const loc = (input?.lat && input?.lng)
    ? { lat: input.lat, lng: input.lng }
    : { lat: MARSEILLE.lat, lng: MARSEILLE.lng }
  const cityName = input?.cityName || (input?.lat ? "votre position" : MARSEILLE.cityName)

  const activities = await fetchWithProgressiveRadius(
    {},
    loc,
    limit,
    (a, b) => {
      const favDiff = b._count.favorites - a._count.favorites
      if (favDiff !== 0) return favDiff
      return (a.distance ?? 0) - (b.distance ?? 0)
    }
  )

  return { activities, cityName }
}

/**
 * Section B: "Quoi faire ce soir"
 * Activities likely open in the evening — uses scheduleText heuristic.
 * Falls back to all activities sorted by popularity if no evening matches.
 */
export async function getEveningActivities(
  input?: LocationInput,
  limit: number = DEFAULT_LIMIT
): Promise<{ activities: HomeActivity[] }> {
  const loc = (input?.lat && input?.lng)
    ? { lat: input.lat, lng: input.lng }
    : { lat: MARSEILLE.lat, lng: MARSEILLE.lng }

  // Heuristic: look for activities with evening-related schedule text
  // or zone2 tags that suggest evening activities
  const eveningActivities = await fetchWithProgressiveRadius(
    {
      OR: [
        { scheduleText: { contains: "22h", mode: "insensitive" } },
        { scheduleText: { contains: "23h", mode: "insensitive" } },
        { scheduleText: { contains: "00h", mode: "insensitive" } },
        { scheduleText: { contains: "01h", mode: "insensitive" } },
        { scheduleText: { contains: "02h", mode: "insensitive" } },
        { scheduleText: { contains: "minuit", mode: "insensitive" } },
        { zone2Tags: { has: "soiree" } },
        { zone2Tags: { has: "after-work" } },
      ],
    },
    loc,
    limit,
    (a, b) => {
      const favDiff = b._count.favorites - a._count.favorites
      if (favDiff !== 0) return favDiff
      return (a.distance ?? 0) - (b.distance ?? 0)
    }
  )

  // If not enough evening activities, widen criteria: anything open after 18h
  if (eveningActivities.length < limit) {
    const broader = await fetchWithProgressiveRadius(
      {
        OR: [
          { scheduleText: { contains: "18h", mode: "insensitive" } },
          { scheduleText: { contains: "19h", mode: "insensitive" } },
          { scheduleText: { contains: "20h", mode: "insensitive" } },
          { scheduleText: { contains: "21h", mode: "insensitive" } },
          { scheduleText: { contains: "22h", mode: "insensitive" } },
          { scheduleText: { contains: "23h", mode: "insensitive" } },
          { scheduleText: { contains: "00h", mode: "insensitive" } },
          { zone2Tags: { has: "soiree" } },
          { zone2Tags: { has: "after-work" } },
        ],
      },
      loc,
      limit,
      (a, b) => {
        const favDiff = b._count.favorites - a._count.favorites
        if (favDiff !== 0) return favDiff
        return (a.distance ?? 0) - (b.distance ?? 0)
      }
    )

    // Merge without duplicates
    const existingIds = new Set(eveningActivities.map((a) => a.id))
    const additional = broader.filter((a) => !existingIds.has(a.id))
    return { activities: [...eveningActivities, ...additional].slice(0, limit) }
  }

  return { activities: eveningActivities }
}

/**
 * Section C: "Coup de coeur Wadelo"
 * Activities marked as adminPick by admins.
 */
export async function getAdminPickActivities(
  input?: LocationInput,
  limit: number = DEFAULT_LIMIT
): Promise<{ activities: HomeActivity[] }> {
  const loc = (input?.lat && input?.lng)
    ? { lat: input.lat, lng: input.lng }
    : { lat: MARSEILLE.lat, lng: MARSEILLE.lng }

  const activities = await fetchWithProgressiveRadius(
    { adminPick: true },
    loc,
    limit,
    (a, b) => {
      const favDiff = b._count.favorites - a._count.favorites
      if (favDiff !== 0) return favDiff
      return (a.distance ?? 0) - (b.distance ?? 0)
    }
  )

  return { activities }
}
