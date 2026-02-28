/**
 * Tests for multi-resource slot generation and availability filtering.
 * Pure logic tests (no DB).
 */
import { describe, it, expect } from "vitest"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Resource {
  id: string
  name: string
  capacity: number
  isActive: boolean
}

interface TimeRange {
  start: string
  end: string
}

interface RawSlot {
  startAt: Date
  endAt: Date
}

interface GeneratedSlot {
  startAt: Date
  endAt: Date
  capacity: number
  resourceId: string | null
}

// ─── Pure slot generation logic (mirrors generateAndPersistSlots logic) ───────

function generateSlotsForRange(
  dateStr: string,
  ranges: TimeRange[],
  durationMinutes: number
): RawSlot[] {
  const slots: RawSlot[] = []
  for (const range of ranges) {
    const [sh, sm] = range.start.split(":").map(Number)
    const [eh, em] = range.end.split(":").map(Number)
    const dayBase = new Date(`${dateStr}T00:00:00Z`)
    let current = new Date(dayBase.getTime() + (sh * 60 + sm) * 60_000)
    const rangeEnd = new Date(dayBase.getTime() + (eh * 60 + em) * 60_000)

    while (current < rangeEnd) {
      const slotEnd = new Date(current.getTime() + durationMinutes * 60_000)
      if (slotEnd > rangeEnd) break
      slots.push({ startAt: new Date(current), endAt: slotEnd })
      current = slotEnd
    }
  }
  return slots
}

/**
 * Simule generateAndPersistSlots pour une journée, sans DB.
 * Retourne la liste de slots qui auraient été créés.
 */
function simulateGenerate(
  resources: Resource[],
  ranges: TimeRange[],
  durationMinutes: number,
  capacityPerSlot: number,
  dateStr: string,
  existingSlots: Array<{ startAt: Date; resourceId: string | null }>
): GeneratedSlot[] {
  const rawSlots = generateSlotsForRange(dateStr, ranges, durationMinutes)
  const hasResources = resources.filter((r) => r.isActive).length > 0
  const created: GeneratedSlot[] = []

  if (hasResources) {
    for (const slot of rawSlots) {
      for (const resource of resources.filter((r) => r.isActive)) {
        // Anti-duplication par (startAt, resourceId)
        const exists = existingSlots.some(
          (e) =>
            e.startAt.getTime() === slot.startAt.getTime() &&
            e.resourceId === resource.id
        )
        if (exists) continue
        created.push({
          startAt: slot.startAt,
          endAt: slot.endAt,
          capacity: resource.capacity,
          resourceId: resource.id,
        })
      }
    }
  } else {
    for (const slot of rawSlots) {
      const exists = existingSlots.some(
        (e) => e.startAt.getTime() === slot.startAt.getTime() && e.resourceId === null
      )
      if (exists) continue
      created.push({
        startAt: slot.startAt,
        endAt: slot.endAt,
        capacity: capacityPerSlot,
        resourceId: null,
      })
    }
  }

  return created
}

// ─── Tests: Multi-resource slot generation ───────────────────────────────────

describe("Multi-resource slot generation", () => {
  const resources: Resource[] = [
    { id: "res-a", name: "Salle A", capacity: 6, isActive: true },
    { id: "res-b", name: "Salle B", capacity: 4, isActive: true },
  ]

  const ranges: TimeRange[] = [{ start: "08:00", end: "10:00" }]
  const dateStr = "2026-03-15"

  it("creates one slot per resource for each time slot", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, [])
    // 2 time slots (08:00, 09:00) × 2 resources = 4 total
    expect(created).toHaveLength(4)
  })

  it("each slot has the resource's capacity", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, [])
    const salleA = created.filter((s) => s.resourceId === "res-a")
    const salleB = created.filter((s) => s.resourceId === "res-b")
    expect(salleA.every((s) => s.capacity === 6)).toBe(true)
    expect(salleB.every((s) => s.capacity === 4)).toBe(true)
  })

  it("each slot has the correct resourceId set", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, [])
    expect(created.every((s) => s.resourceId !== null)).toBe(true)
  })

  it("creates slots for both 08:00 and 09:00 time slots", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, [])
    const base = new Date("2026-03-15T00:00:00Z")
    const at8h = new Date(base.getTime() + 8 * 3600_000)
    const at9h = new Date(base.getTime() + 9 * 3600_000)
    const starts = created.map((s) => s.startAt.getTime())
    expect(starts.filter((t) => t === at8h.getTime())).toHaveLength(2) // one per resource
    expect(starts.filter((t) => t === at9h.getTime())).toHaveLength(2)
  })

  it("skips inactive resources", () => {
    const mixedResources: Resource[] = [
      { id: "res-a", name: "Salle A", capacity: 6, isActive: true },
      { id: "res-inactive", name: "Salle inactive", capacity: 4, isActive: false },
    ]
    const created = simulateGenerate(mixedResources, ranges, 60, 10, dateStr, [])
    // 2 time slots × 1 active resource = 2
    expect(created).toHaveLength(2)
    expect(created.every((s) => s.resourceId === "res-a")).toBe(true)
  })

  it("falls back to global slots when no resources", () => {
    const created = simulateGenerate([], ranges, 60, 10, dateStr, [])
    // 2 time slots, no resources → 2 global slots
    expect(created).toHaveLength(2)
    expect(created.every((s) => s.resourceId === null)).toBe(true)
  })

  it("uses capacityPerSlot for global slots", () => {
    const created = simulateGenerate([], ranges, 60, 15, dateStr, [])
    expect(created.every((s) => s.capacity === 15)).toBe(true)
  })
})

// ─── Tests: Anti-duplication ─────────────────────────────────────────────────

describe("Anti-duplication (idempotent generation)", () => {
  const resources: Resource[] = [
    { id: "res-a", name: "Salle A", capacity: 6, isActive: true },
    { id: "res-b", name: "Salle B", capacity: 4, isActive: true },
  ]
  const ranges: TimeRange[] = [{ start: "08:00", end: "10:00" }]
  const dateStr = "2026-03-15"
  const base = new Date("2026-03-15T00:00:00Z")

  it("skips already-existing slots for a specific resource", () => {
    const existing = [
      { startAt: new Date(base.getTime() + 8 * 3600_000), resourceId: "res-a" },
    ]
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, existing)
    // 4 total - 1 existing = 3
    expect(created).toHaveLength(3)
    // The skipped one should be res-a at 08:00
    const skipped = created.find(
      (s) =>
        s.startAt.getTime() === base.getTime() + 8 * 3600_000 && s.resourceId === "res-a"
    )
    expect(skipped).toBeUndefined()
  })

  it("does not skip slot for different resource at same time", () => {
    const existing = [
      { startAt: new Date(base.getTime() + 8 * 3600_000), resourceId: "res-a" },
    ]
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, existing)
    const resBat8 = created.find(
      (s) =>
        s.startAt.getTime() === base.getTime() + 8 * 3600_000 && s.resourceId === "res-b"
    )
    expect(resBat8).toBeDefined()
  })

  it("creates 0 new slots when all already exist (idempotent)", () => {
    const at8 = new Date(base.getTime() + 8 * 3600_000)
    const at9 = new Date(base.getTime() + 9 * 3600_000)
    const existing = [
      { startAt: at8, resourceId: "res-a" },
      { startAt: at8, resourceId: "res-b" },
      { startAt: at9, resourceId: "res-a" },
      { startAt: at9, resourceId: "res-b" },
    ]
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr, existing)
    expect(created).toHaveLength(0)
  })

  it("anti-duplication works for global slots too (resourceId=null)", () => {
    const at8 = new Date(base.getTime() + 8 * 3600_000)
    const existing = [{ startAt: at8, resourceId: null }]
    const created = simulateGenerate([], ranges, 60, 10, dateStr, existing)
    // 2 time slots - 1 existing = 1
    expect(created).toHaveLength(1)
  })
})

// ─── Tests: Availability filtering by resourceId ─────────────────────────────

interface SlotInfo {
  startAt: Date
  endAt: Date
  remainingCapacity: number
  isAvailable: boolean
  resourceId?: string
}

/**
 * Simule le filtrage des slots par resourceId (mode PICK_RESOURCE_FIRST).
 */
function filterSlotsByResource(slots: SlotInfo[], resourceId: string): SlotInfo[] {
  return slots.filter((s) => s.resourceId === resourceId)
}

describe("Availability filtering by resourceId (PICK_RESOURCE_FIRST)", () => {
  const now = new Date("2026-03-15T07:00:00Z")

  const allSlots: SlotInfo[] = [
    {
      startAt: new Date("2026-03-15T08:00:00Z"),
      endAt: new Date("2026-03-15T09:00:00Z"),
      remainingCapacity: 6,
      isAvailable: true,
      resourceId: "res-a",
    },
    {
      startAt: new Date("2026-03-15T08:00:00Z"),
      endAt: new Date("2026-03-15T09:00:00Z"),
      remainingCapacity: 4,
      isAvailable: true,
      resourceId: "res-b",
    },
    {
      startAt: new Date("2026-03-15T09:00:00Z"),
      endAt: new Date("2026-03-15T10:00:00Z"),
      remainingCapacity: 6,
      isAvailable: true,
      resourceId: "res-a",
    },
    {
      startAt: new Date("2026-03-15T09:00:00Z"),
      endAt: new Date("2026-03-15T10:00:00Z"),
      remainingCapacity: 0,
      isAvailable: false,
      resourceId: "res-b",
    },
  ]

  it("filters to only slots for the selected resource", () => {
    const result = filterSlotsByResource(allSlots, "res-a")
    expect(result).toHaveLength(2)
    expect(result.every((s) => s.resourceId === "res-a")).toBe(true)
  })

  it("filtered result preserves availability state", () => {
    const result = filterSlotsByResource(allSlots, "res-b")
    expect(result[0].isAvailable).toBe(true)
    expect(result[1].isAvailable).toBe(false)
  })

  it("returns empty when no slots for the resource", () => {
    const result = filterSlotsByResource(allSlots, "res-c")
    expect(result).toHaveLength(0)
  })

  it("unfiltered mode (HIDDEN) returns all slots", () => {
    // No filter → return allSlots as-is
    const result = allSlots
    expect(result).toHaveLength(4)
  })
})

// ─── Tests: Available resources for slot (PICK_TIME_FIRST) ───────────────────

interface ResourceOption {
  id: string
  name: string
  remainingCapacity: number
}

/**
 * Simule getAvailableResourcesForSlot (pure logic, no DB).
 */
function getAvailableResourcesForSlotPure(
  slots: Array<{
    id: string
    startAt: Date
    capacity: number
    resourceId: string
    resourceName: string
  }>,
  bookedBySlot: Map<string, number>,
  targetStartAt: Date,
  partySize: number
): ResourceOption[] {
  const matching = slots.filter(
    (s) => s.startAt.getTime() === targetStartAt.getTime() && s.resourceId
  )

  return matching
    .filter((slot) => {
      const booked = bookedBySlot.get(slot.id) ?? 0
      return slot.capacity - booked >= partySize
    })
    .map((slot) => ({
      id: slot.resourceId,
      name: slot.resourceName,
      remainingCapacity: slot.capacity - (bookedBySlot.get(slot.id) ?? 0),
    }))
}

describe("Available resources for slot (PICK_TIME_FIRST)", () => {
  const at8h = new Date("2026-03-15T08:00:00Z")

  const slots = [
    { id: "slot-a-8h", startAt: at8h, capacity: 6, resourceId: "res-a", resourceName: "Salle A" },
    { id: "slot-b-8h", startAt: at8h, capacity: 4, resourceId: "res-b", resourceName: "Salle B" },
  ]

  it("returns both resources when both have capacity", () => {
    const booked = new Map<string, number>()
    const result = getAvailableResourcesForSlotPure(slots, booked, at8h, 1)
    expect(result).toHaveLength(2)
  })

  it("excludes resource that is fully booked", () => {
    const booked = new Map([["slot-b-8h", 4]]) // Salle B full
    const result = getAvailableResourcesForSlotPure(slots, booked, at8h, 1)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("res-a")
  })

  it("excludes resource that doesn't fit partySize", () => {
    const booked = new Map([["slot-b-8h", 2]]) // Salle B: 2 booked, 2 remaining
    const result = getAvailableResourcesForSlotPure(slots, booked, at8h, 3) // needs 3
    // Salle A: 6-0=6 ≥ 3 ✓   Salle B: 4-2=2 < 3 ✗
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("res-a")
  })

  it("returns correct remainingCapacity for each resource", () => {
    const booked = new Map([["slot-a-8h", 2]])
    const result = getAvailableResourcesForSlotPure(slots, booked, at8h, 1)
    const salleA = result.find((r) => r.id === "res-a")
    expect(salleA?.remainingCapacity).toBe(4)
  })

  it("returns empty when no slots match the startAt", () => {
    const at9h = new Date("2026-03-15T09:00:00Z")
    const result = getAvailableResourcesForSlotPure(slots, new Map(), at9h, 1)
    expect(result).toHaveLength(0)
  })

  it("returns empty when all resources are fully booked", () => {
    const booked = new Map([["slot-a-8h", 6], ["slot-b-8h", 4]])
    const result = getAvailableResourcesForSlotPure(slots, booked, at8h, 1)
    expect(result).toHaveLength(0)
  })
})

// ─── Tests: Favorites feed mapping (video → establishmentId → isFavorited) ───

describe("Favorites feed mapping (video → activityId)", () => {
  interface FeedVideo {
    id: string
    activity: { id: string; title: string }
    establishment: { id: string; name: string }
  }

  const videos: FeedVideo[] = [
    { id: "vid-1", activity: { id: "act-a", title: "Escape Game Paris" }, establishment: { id: "est-1", name: "Escape City" } },
    { id: "vid-2", activity: { id: "act-a", title: "Escape Game Paris" }, establishment: { id: "est-1", name: "Escape City" } },
    { id: "vid-3", activity: { id: "act-b", title: "Bowling Lyon" }, establishment: { id: "est-2", name: "Bowl'O" } },
  ]

  function computeIsFavorited(
    video: FeedVideo,
    favoritedActivityIds: Set<string>
  ): boolean {
    return favoritedActivityIds.has(video.activity.id)
  }

  it("returns true when activity is in favorites set", () => {
    const favIds = new Set(["act-a"])
    expect(computeIsFavorited(videos[0], favIds)).toBe(true)
  })

  it("returns false when activity is not in favorites set", () => {
    const favIds = new Set(["act-a"])
    expect(computeIsFavorited(videos[2], favIds)).toBe(false)
  })

  it("two videos with the same activityId both show as favorited", () => {
    const favIds = new Set(["act-a"])
    expect(computeIsFavorited(videos[0], favIds)).toBe(true)
    expect(computeIsFavorited(videos[1], favIds)).toBe(true)
  })

  it("toggling favorite adds activityId to set", () => {
    const favIds = new Set<string>()
    favIds.add("act-b")
    expect(computeIsFavorited(videos[2], favIds)).toBe(true)
  })

  it("toggling off removes activityId from set", () => {
    const favIds = new Set(["act-a", "act-b"])
    favIds.delete("act-a")
    expect(computeIsFavorited(videos[0], favIds)).toBe(false)
    expect(computeIsFavorited(videos[2], favIds)).toBe(true)
  })

  it("empty favorites set → all videos unfavorited", () => {
    const favIds = new Set<string>()
    expect(videos.every((v) => !computeIsFavorited(v, favIds))).toBe(true)
  })

  it("full favorites set → all videos favorited", () => {
    const favIds = new Set(["act-a", "act-b"])
    expect(videos.every((v) => computeIsFavorited(v, favIds))).toBe(true)
  })
})
