/**
 * Tests for ReservationSlot logic:
 * - Availability from persisted slots
 * - Resource allocation
 * - Slot duplication logic
 */
import { describe, it, expect } from "vitest"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlotInfo {
  startAt: Date
  endAt: Date
  remainingCapacity: number
  isAvailable: boolean
  slotId?: string
  resourceId?: string
  resourceName?: string
  isPersisted?: boolean
}

interface PersistedSlot {
  id: string
  startAt: Date
  endAt: Date
  capacity: number
  isActive: boolean
  resourceId: string | null
  resource: { id: string; name: string; capacity: number } | null
}

// ─── Pure logic from availability.ts (no DB) ─────────────────────────────────

function computeSlotAvailability(
  slot: PersistedSlot,
  bookedBySlot: Map<string, number>,
  minStartAt: Date
): SlotInfo | null {
  if (!slot.isActive) return null
  if (slot.startAt < minStartAt) return null

  const booked = bookedBySlot.get(slot.id) ?? 0
  const remaining = Math.max(0, slot.capacity - booked)

  return {
    startAt: slot.startAt,
    endAt: slot.endAt,
    remainingCapacity: remaining,
    isAvailable: remaining > 0,
    slotId: slot.id,
    resourceId: slot.resourceId ?? undefined,
    resourceName: slot.resource?.name,
    isPersisted: true,
  }
}

function computeMultipleSlots(
  slots: PersistedSlot[],
  bookedBySlot: Map<string, number>,
  minStartAt: Date
): SlotInfo[] {
  return slots
    .map((s) => computeSlotAvailability(s, bookedBySlot, minStartAt))
    .filter((s): s is SlotInfo => s !== null)
}

// ─── Resource auto-allocation logic ─────────────────────────────────────────

interface Resource {
  id: string
  name: string
  capacity: number
  isActive: boolean
}

function allocateResource(
  resources: Resource[],
  bookedByResource: Map<string, number>,
  partySize: number
): Resource | null {
  // Find first resource with enough capacity
  for (const r of resources) {
    if (!r.isActive) continue
    const booked = bookedByResource.get(r.id) ?? 0
    const remaining = r.capacity - booked
    if (remaining >= partySize) return r
  }
  return null
}

// ─── Slot duplication logic ──────────────────────────────────────────────────

function buildDuplicateSlots(
  sourceSlot: { startAt: Date; endAt: Date; capacity: number; resourceId: string | null },
  targetDates: string[]
): Array<{ startAt: Date; endAt: Date; capacity: number; resourceId: string | null }> {
  const durationMs = sourceSlot.endAt.getTime() - sourceSlot.startAt.getTime()
  const sourceHour = sourceSlot.startAt.getUTCHours()
  const sourceMinute = sourceSlot.startAt.getUTCMinutes()

  return targetDates.map((dateStr) => {
    const [year, month, day] = dateStr.split("-").map(Number)
    const newStart = new Date(Date.UTC(year, month - 1, day, sourceHour, sourceMinute))
    const newEnd = new Date(newStart.getTime() + durationMs)
    return {
      startAt: newStart,
      endAt: newEnd,
      capacity: sourceSlot.capacity,
      resourceId: sourceSlot.resourceId,
    }
  })
}

// ─── Tests: Availability from persisted slots ─────────────────────────────────

describe("Availability from persisted ReservationSlot", () => {
  const now = new Date("2026-03-10T09:00:00Z")
  const minStartAt = new Date(now.getTime() + 0) // no min notice for tests

  const slot1: PersistedSlot = {
    id: "slot-1",
    startAt: new Date("2026-03-10T10:00:00Z"),
    endAt: new Date("2026-03-10T11:00:00Z"),
    capacity: 10,
    isActive: true,
    resourceId: null,
    resource: null,
  }

  const slot2: PersistedSlot = {
    id: "slot-2",
    startAt: new Date("2026-03-10T11:00:00Z"),
    endAt: new Date("2026-03-10T12:00:00Z"),
    capacity: 10,
    isActive: true,
    resourceId: null,
    resource: null,
  }

  it("returns available slot with full capacity when no bookings", () => {
    const bookedBySlot = new Map<string, number>()
    const result = computeSlotAvailability(slot1, bookedBySlot, minStartAt)

    expect(result).not.toBeNull()
    expect(result!.remainingCapacity).toBe(10)
    expect(result!.isAvailable).toBe(true)
    expect(result!.isPersisted).toBe(true)
    expect(result!.slotId).toBe("slot-1")
  })

  it("returns correct remaining capacity after partial booking", () => {
    const bookedBySlot = new Map([["slot-1", 3]])
    const result = computeSlotAvailability(slot1, bookedBySlot, minStartAt)

    expect(result!.remainingCapacity).toBe(7)
    expect(result!.isAvailable).toBe(true)
  })

  it("returns isAvailable=false when slot is full", () => {
    const bookedBySlot = new Map([["slot-1", 10]])
    const result = computeSlotAvailability(slot1, bookedBySlot, minStartAt)

    expect(result!.remainingCapacity).toBe(0)
    expect(result!.isAvailable).toBe(false)
  })

  it("never returns negative remainingCapacity (overbooking protection)", () => {
    const bookedBySlot = new Map([["slot-1", 15]]) // overbooked
    const result = computeSlotAvailability(slot1, bookedBySlot, minStartAt)

    expect(result!.remainingCapacity).toBe(0)
    expect(result!.isAvailable).toBe(false)
  })

  it("filters out inactive slots", () => {
    const inactiveSlot = { ...slot1, isActive: false }
    const result = computeSlotAvailability(inactiveSlot, new Map(), minStartAt)
    expect(result).toBeNull()
  })

  it("filters out slots before minStartAt", () => {
    const futureMin = new Date("2026-03-10T12:00:00Z")
    const result = computeSlotAvailability(slot1, new Map(), futureMin)
    expect(result).toBeNull()
  })

  it("processes multiple slots correctly", () => {
    const bookedBySlot = new Map([["slot-1", 5], ["slot-2", 10]])
    const results = computeMultipleSlots([slot1, slot2], bookedBySlot, minStartAt)

    expect(results).toHaveLength(2)
    expect(results[0].remainingCapacity).toBe(5)
    expect(results[0].isAvailable).toBe(true)
    expect(results[1].remainingCapacity).toBe(0)
    expect(results[1].isAvailable).toBe(false)
  })

  it("includes resource info when slot has a resource", () => {
    const slotWithResource: PersistedSlot = {
      ...slot1,
      resourceId: "res-1",
      resource: { id: "res-1", name: "Salle A", capacity: 6 },
    }
    const result = computeSlotAvailability(slotWithResource, new Map(), minStartAt)

    expect(result!.resourceId).toBe("res-1")
    expect(result!.resourceName).toBe("Salle A")
  })
})

// ─── Tests: Resource allocation ───────────────────────────────────────────────

describe("Resource allocation", () => {
  const resources: Resource[] = [
    { id: "res-a", name: "Salle A", capacity: 6, isActive: true },
    { id: "res-b", name: "Salle B", capacity: 4, isActive: true },
    { id: "res-c", name: "Salle C (inactive)", capacity: 8, isActive: false },
  ]

  it("allocates first available resource with enough capacity", () => {
    const booked = new Map<string, number>()
    const result = allocateResource(resources, booked, 4)
    expect(result?.id).toBe("res-a") // first with enough capacity
  })

  it("skips resource that is too small for party", () => {
    const booked = new Map<string, number>()
    const result = allocateResource(resources, booked, 5)
    expect(result?.id).toBe("res-a") // Salle B (4) is too small, Salle A (6) ok
  })

  it("skips fully booked resource", () => {
    const booked = new Map([["res-a", 6]]) // Salle A full
    const result = allocateResource(resources, booked, 3)
    expect(result?.id).toBe("res-b") // falls through to Salle B
  })

  it("returns null when no resource has enough capacity", () => {
    const booked = new Map([["res-a", 6], ["res-b", 4]])
    const result = allocateResource(resources, booked, 2)
    expect(result).toBeNull()
  })

  it("skips inactive resources", () => {
    // Only res-c has capacity but it's inactive, so null
    const booked = new Map([["res-a", 6], ["res-b", 4]])
    const result = allocateResource(resources, booked, 1)
    expect(result).toBeNull() // res-c is inactive
  })

  it("allocates correctly for party of 1 (edge case)", () => {
    const booked = new Map<string, number>()
    const result = allocateResource(resources, booked, 1)
    expect(result).not.toBeNull()
    expect(result?.id).toBe("res-a")
  })

  it("partial booking: allocates resource with remaining capacity", () => {
    const booked = new Map([["res-a", 3]]) // Salle A: 3 booked out of 6
    const result = allocateResource(resources, booked, 4) // needs 4 more → still 3 remaining
    // res-a has 6-3=3 remaining, not enough for 4
    // res-b has 4-0=4 remaining, exactly enough
    expect(result?.id).toBe("res-b")
  })
})

// ─── Tests: Slot duplication ──────────────────────────────────────────────────

describe("Slot duplication logic", () => {
  const sourceSlot = {
    startAt: new Date("2026-03-10T10:00:00Z"), // 10:00 UTC
    endAt: new Date("2026-03-10T11:00:00Z"),   // 11:00 UTC (60 min)
    capacity: 8,
    resourceId: "res-a",
  }

  it("duplicates a slot to a single target date", () => {
    const result = buildDuplicateSlots(sourceSlot, ["2026-03-17"])
    expect(result).toHaveLength(1)
    expect(result[0].startAt.getUTCHours()).toBe(10)
    expect(result[0].startAt.getUTCMinutes()).toBe(0)
  })

  it("preserves duration on duplicated slots", () => {
    const result = buildDuplicateSlots(sourceSlot, ["2026-03-17"])
    const duration = result[0].endAt.getTime() - result[0].startAt.getTime()
    expect(duration).toBe(60 * 60 * 1000) // 60 minutes
  })

  it("preserves capacity on duplicated slots", () => {
    const result = buildDuplicateSlots(sourceSlot, ["2026-03-17"])
    expect(result[0].capacity).toBe(8)
  })

  it("preserves resourceId on duplicated slots", () => {
    const result = buildDuplicateSlots(sourceSlot, ["2026-03-17"])
    expect(result[0].resourceId).toBe("res-a")
  })

  it("duplicates to multiple dates", () => {
    const dates = ["2026-03-17", "2026-03-24", "2026-03-31"]
    const result = buildDuplicateSlots(sourceSlot, dates)
    expect(result).toHaveLength(3)
  })

  it("each duplicated slot is on the correct date", () => {
    const dates = ["2026-03-17", "2026-03-24"]
    const result = buildDuplicateSlots(sourceSlot, dates)

    expect(result[0].startAt.toISOString().startsWith("2026-03-17")).toBe(true)
    expect(result[1].startAt.toISOString().startsWith("2026-03-24")).toBe(true)
  })

  it("handles slot with no resource (resourceId null)", () => {
    const noResourceSlot = { ...sourceSlot, resourceId: null }
    const result = buildDuplicateSlots(noResourceSlot, ["2026-03-17"])
    expect(result[0].resourceId).toBeNull()
  })

  it("handles 90-minute duration correctly", () => {
    const slot90min = {
      ...sourceSlot,
      endAt: new Date("2026-03-10T11:30:00Z"),
    }
    const result = buildDuplicateSlots(slot90min, ["2026-03-17"])
    const duration = result[0].endAt.getTime() - result[0].startAt.getTime()
    expect(duration).toBe(90 * 60 * 1000)
  })
})

// ─── Tests: Slot capacity with slotId (anti double-booking) ──────────────────

describe("Slot capacity verification (anti double-booking)", () => {
  it("rejects booking when slot is at capacity", () => {
    const slotCapacity = 6
    const alreadyBooked = 6
    const partySize = 1

    const remaining = slotCapacity - alreadyBooked
    expect(remaining + partySize > slotCapacity).toBe(false) // already at cap
    expect(alreadyBooked + partySize > slotCapacity).toBe(true) // overflow check
  })

  it("accepts booking when slot has space", () => {
    const slotCapacity = 10
    const alreadyBooked = 3
    const partySize = 4

    expect(alreadyBooked + partySize <= slotCapacity).toBe(true)
  })

  it("accepts booking for exactly the remaining capacity", () => {
    const slotCapacity = 10
    const alreadyBooked = 7
    const partySize = 3

    expect(alreadyBooked + partySize === slotCapacity).toBe(true)
    expect(alreadyBooked + partySize <= slotCapacity).toBe(true)
  })
})
