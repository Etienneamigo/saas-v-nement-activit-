import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { calculateDistance } from "@/lib/geo"
import { enforceApiRateLimit } from "../_helpers/rl"

/**
 * GET /api/mobile/feed
 *
 * Cursor-based paginated video feed with optional radius filtering and randomization.
 *
 * Query params:
 * - cursor: string (optional) - cursor for pagination (last video id)
 * - limit: number (optional, default 10, max 50)
 * - lat: number (optional) - user latitude for radius filtering
 * - lng: number (optional) - user longitude for radius filtering
 * - radius: number (optional, default 50) - radius in km
 * - seed: number (optional) - random seed for consistent randomization across pages
 * - category: string (optional) - filter by video category
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const rlResponse = await enforceApiRateLimit(request)
  if (rlResponse) return rlResponse

  try {
    const { searchParams } = new URL(request.url)

    const cursor = searchParams.get("cursor") || undefined
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50)
    const lat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : undefined
    const lng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : undefined
    const radius = parseFloat(searchParams.get("radius") || "50")
    const seed = searchParams.get("seed") ? parseInt(searchParams.get("seed")!) : Math.floor(Math.random() * 1000000)
    const category = searchParams.get("category") || undefined

    // Fetch video medias with their activity and establishment info
    const whereClause: Record<string, unknown> = {
      kind: { in: ["VIDEO", "VIDEO_UPLOAD"] },
      activity: {
        status: "PUBLISHED",
      },
    }

    if (category) {
      whereClause.videoCategory = category
    }

    // Fetch more than needed to allow for radius filtering
    const fetchLimit = lat && lng ? limit * 3 : limit + 1

    const videos = await prisma.media.findMany({
      where: whereClause,
      include: {
        activity: {
          include: {
            establishment: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor itself
      }),
      take: fetchLimit,
    })

    // Apply radius filtering if coordinates provided
    let filteredVideos = videos
    if (lat !== undefined && lng !== undefined) {
      filteredVideos = videos.filter((video) => {
        const distance = calculateDistance(lat, lng, video.activity.lat, video.activity.lng)
        return distance <= radius
      })
    }

    // Apply seed-based shuffling for consistent randomization
    // Using Fisher-Yates shuffle with seeded PRNG
    const shuffled = [...filteredVideos]
    let seedValue = seed
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Simple seeded random (LCG)
      seedValue = (seedValue * 1664525 + 1013904223) % 4294967296
      const j = Math.abs(seedValue) % (i + 1)
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // Apply pagination limit
    const result = shuffled.slice(0, limit)
    const hasMore = shuffled.length > limit

    // Format response
    const formattedVideos = result.map((video) => ({
      id: video.id,
      url: video.url.startsWith("/uploads/")
        ? video.url.replace("/uploads/", "/api/uploads/")
        : video.url,
      kind: video.kind,
      title: video.title,
      videoCategory: video.videoCategory,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      fileName: video.fileName,
      createdAt: video.createdAt,
      activity: {
        id: video.activity.id,
        title: video.activity.title,
        type: video.activity.type,
        city: video.activity.city,
        lat: video.activity.lat,
        lng: video.activity.lng,
      },
      establishment: {
        id: video.activity.establishment.id,
        name: video.activity.establishment.name,
        city: video.activity.establishment.city,
      },
    }))

    const nextCursor = hasMore && result.length > 0
      ? result[result.length - 1].id
      : null

    return NextResponse.json({
      videos: formattedVideos,
      nextCursor,
      seed,
      hasMore,
    })
  } catch (error) {
    console.error("Error fetching mobile video feed:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération du feed" },
      { status: 500 }
    )
  }
}
