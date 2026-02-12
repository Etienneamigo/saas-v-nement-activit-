import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { calculateDistance } from "@/lib/geo"
import { enforceApiRateLimit } from "../_helpers/rl"

// Marseille fallback coordinates
const MARSEILLE = { lat: 43.2965, lng: 5.3698, cityName: "Marseille" }

const PROGRESSIVE_RADII = [5, 10, 20, 35, 50]
const DEFAULT_LIMIT = 10

type HomeActivity = {
  id: string
  title: string
  description: string | null
  type: string
  city: string
  address: string | null
  lat: number
  lng: number
  priceFrom: number | null
  durationMinutes: number | null
  minPeople: number | null
  maxPeople: number | null
  tags: string[]
  scheduleText: string | null
  adminPick: boolean
  zone2Tags: string[]
  status: string
  medias: { url: string; kind: string }[]
  _count: { favorites: number }
  distance?: number
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
  const allActivities = (await prisma.activity.findMany({
    where: { ...where, status: "PUBLISHED" },
    include: {
      medias: { where: { kind: "IMAGE" }, take: 1, orderBy: { sortOrder: "asc" } },
      _count: { select: { favorites: true } },
    },
  })) as HomeActivity[]

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

/** Format activity for the API response */
function formatActivity(a: HomeActivity) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    type: a.type,
    city: a.city,
    address: a.address,
    lat: a.lat,
    lng: a.lng,
    priceFrom: a.priceFrom,
    durationMinutes: a.durationMinutes,
    minPeople: a.minPeople,
    maxPeople: a.maxPeople,
    tags: a.tags,
    scheduleText: a.scheduleText,
    adminPick: a.adminPick,
    distance: a.distance ?? null,
    medias: a.medias.map((m) => ({ url: m.url, kind: m.kind })),
    _count: { favorites: a._count.favorites },
  }
}

/** Sort by favorites desc, then distance asc */
function popularitySort(a: HomeActivity, b: HomeActivity): number {
  const favDiff = b._count.favorites - a._count.favorites
  if (favDiff !== 0) return favDiff
  return (a.distance ?? 0) - (b.distance ?? 0)
}

/**
 * GET /api/mobile/home
 *
 * Returns home page sections: popular, evening, adminPicks.
 *
 * Query params:
 * - lat: number (optional, default 43.2965 Marseille)
 * - lng: number (optional, default 5.3698 Marseille)
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const rlResponse = await enforceApiRateLimit(request)
  if (rlResponse) return rlResponse

  try {
    const { searchParams } = new URL(request.url)

    const lat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : undefined
    const lng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : undefined

    const loc = lat && lng
      ? { lat, lng }
      : { lat: MARSEILLE.lat, lng: MARSEILLE.lng }

    const cityName = lat ? "votre position" : MARSEILLE.cityName

    // ---------- Popular ----------
    const popularActivities = await fetchWithProgressiveRadius(
      {},
      loc,
      DEFAULT_LIMIT,
      popularitySort
    )

    // ---------- Evening ----------
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
      DEFAULT_LIMIT,
      popularitySort
    )

    // Fallback: if not enough evening activities, broaden to >=18h
    let finalEvening = eveningActivities
    if (eveningActivities.length < DEFAULT_LIMIT) {
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
        DEFAULT_LIMIT,
        popularitySort
      )

      const existingIds = new Set(eveningActivities.map((a) => a.id))
      const additional = broader.filter((a) => !existingIds.has(a.id))
      finalEvening = [...eveningActivities, ...additional].slice(0, DEFAULT_LIMIT)
    }

    // ---------- Admin Picks ----------
    const adminPickActivities = await fetchWithProgressiveRadius(
      { adminPick: true },
      loc,
      DEFAULT_LIMIT,
      popularitySort
    )

    return NextResponse.json({
      popular: {
        activities: popularActivities.map(formatActivity),
        cityName,
      },
      evening: {
        activities: finalEvening.map(formatActivity),
      },
      adminPicks: {
        activities: adminPickActivities.map(formatActivity),
      },
    })
  } catch (error) {
    console.error("Error fetching home sections:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des sections d'accueil" },
      { status: 500 }
    )
  }
}
