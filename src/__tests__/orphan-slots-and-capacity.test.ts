/**
 * Tests for:
 * A) Orphan slot prevention: multi-resource generation never creates resourceId=null slots
 * B) Orphan slot cleanup: cleanup deletes unreferenced orphans, preserves referenced ones
 * C) Capacity as maxPartySize: getEffectiveRules uses capacity as source of truth
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

interface GeneratedSlot {
  startAt: Date
  endAt: Date
  capacity: number
  resourceId: string | null
}

// ─── Pure slot generation logic (mirrors generateAndPersistSlots) ─────────────

function generateSlotsForRange(
  dateStr: string,
  ranges: TimeRange[],
  durationMinutes: number
): { startAt: Date; endAt: Date }[] {
  const slots: { startAt: Date; endAt: Date }[] = []
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

function simulateGenerate(
  resources: Resource[],
  ranges: TimeRange[],
  durationMinutes: number,
  capacityPerSlot: number,
  dateStr: string
): GeneratedSlot[] {
  const rawSlots = generateSlotsForRange(dateStr, ranges, durationMinutes)
  const activeResources = resources.filter((r) => r.isActive)
  const hasResources = activeResources.length > 0
  const created: GeneratedSlot[] = []

  if (hasResources) {
    // Multi-resource mode: ONLY create slots with resourceId
    for (const slot of rawSlots) {
      for (const resource of activeResources) {
        created.push({
          startAt: slot.startAt,
          endAt: slot.endAt,
          capacity: resource.capacity,
          resourceId: resource.id,
        })
      }
    }
    // IMPORTANT: no global slot (resourceId=null) is created here
  } else {
    // No resources: global slots
    for (const slot of rawSlots) {
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

// ─── A) Orphan slot prevention ──────────────────────────────────────────────

describe("Orphan slot prevention (multi-resource never creates resourceId=null)", () => {
  const resources: Resource[] = [
    { id: "res-a", name: "Salle A", capacity: 6, isActive: true },
    { id: "res-b", name: "Salle B", capacity: 4, isActive: true },
  ]
  const ranges: TimeRange[] = [{ start: "08:00", end: "12:00" }]
  const dateStr = "2026-03-15"

  it("never creates a slot with resourceId=null when resources exist", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr)
    const orphans = created.filter((s) => s.resourceId === null)
    expect(orphans).toHaveLength(0)
  })

  it("all generated slots have a valid resourceId", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr)
    expect(created.every((s) => s.resourceId !== null)).toBe(true)
    expect(created.every((s) => ["res-a", "res-b"].includes(s.resourceId!))).toBe(true)
  })

  it("creates correct total: time_slots × resources", () => {
    const created = simulateGenerate(resources, ranges, 60, 10, dateStr)
    // 4 time slots (08:00, 09:00, 10:00, 11:00) × 2 resources = 8
    expect(created).toHaveLength(8)
  })

  it("single active resource still never creates orphan slots", () => {
    const singleResource: Resource[] = [
      { id: "res-only", name: "Seule salle", capacity: 10, isActive: true },
    ]
    const created = simulateGenerate(singleResource, ranges, 60, 10, dateStr)
    const orphans = created.filter((s) => s.resourceId === null)
    expect(orphans).toHaveLength(0)
    expect(created.every((s) => s.resourceId === "res-only")).toBe(true)
  })

  it("only creates global slots (resourceId=null) when NO resources exist", () => {
    const created = simulateGenerate([], ranges, 60, 10, dateStr)
    expect(created.every((s) => s.resourceId === null)).toBe(true)
    expect(created).toHaveLength(4)
  })

  it("inactive resources are excluded from generation", () => {
    const mixedResources: Resource[] = [
      { id: "res-a", name: "Active", capacity: 6, isActive: true },
      { id: "res-b", name: "Inactive", capacity: 4, isActive: false },
    ]
    const created = simulateGenerate(mixedResources, ranges, 60, 10, dateStr)
    expect(created.every((s) => s.resourceId === "res-a")).toBe(true)
    const orphans = created.filter((s) => s.resourceId === null)
    expect(orphans).toHaveLength(0)
  })
})

// ─── B) Orphan slot cleanup logic ───────────────────────────────────────────

interface OrphanSlot {
  id: string
  source: "AUTO" | "MANUAL"
  resourceId: string | null
  isActive: boolean
  reservationCount: number
}

/**
 * Simulates cleanupOrphanSlots logic (pure, no DB).
 * Returns: { deleted: string[], deactivated: string[] }
 */
function simulateCleanup(slots: OrphanSlot[]) {
  const deleted: string[] = []
  const deactivated: string[] = []

  for (const slot of slots) {
    if (slot.source !== "AUTO" || slot.resourceId !== null) continue // not an orphan
    if (slot.reservationCount === 0) {
      deleted.push(slot.id)
    } else {
      if (slot.isActive) {
        deactivated.push(slot.id)
      }
    }
  }

  return { deleted, deactivated }
}

describe("Orphan slot cleanup", () => {
  it("deletes AUTO orphan slots with no reservations", () => {
    const slots: OrphanSlot[] = [
      { id: "slot-1", source: "AUTO", resourceId: null, isActive: true, reservationCount: 0 },
      { id: "slot-2", source: "AUTO", resourceId: null, isActive: true, reservationCount: 0 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deleted).toEqual(["slot-1", "slot-2"])
    expect(result.deactivated).toHaveLength(0)
  })

  it("does NOT delete orphan slots that have reservations", () => {
    const slots: OrphanSlot[] = [
      { id: "slot-ref", source: "AUTO", resourceId: null, isActive: true, reservationCount: 2 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deleted).toHaveLength(0)
    expect(result.deactivated).toEqual(["slot-ref"])
  })

  it("deactivates referenced orphan slots instead of deleting", () => {
    const slots: OrphanSlot[] = [
      { id: "slot-ref", source: "AUTO", resourceId: null, isActive: true, reservationCount: 1 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deactivated).toEqual(["slot-ref"])
  })

  it("skips already-deactivated referenced orphan slots", () => {
    const slots: OrphanSlot[] = [
      { id: "slot-ref", source: "AUTO", resourceId: null, isActive: false, reservationCount: 1 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deleted).toHaveLength(0)
    expect(result.deactivated).toHaveLength(0) // already inactive
  })

  it("does NOT touch MANUAL slots without resourceId", () => {
    const slots: OrphanSlot[] = [
      { id: "manual-slot", source: "MANUAL", resourceId: null, isActive: true, reservationCount: 0 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deleted).toHaveLength(0)
    expect(result.deactivated).toHaveLength(0)
  })

  it("does NOT touch AUTO slots WITH a resourceId", () => {
    const slots: OrphanSlot[] = [
      { id: "resource-slot", source: "AUTO", resourceId: "res-a", isActive: true, reservationCount: 0 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deleted).toHaveLength(0)
    expect(result.deactivated).toHaveLength(0)
  })

  it("mixed scenario: deletes unreferenced, deactivates referenced, ignores non-orphans", () => {
    const slots: OrphanSlot[] = [
      { id: "orphan-no-resa", source: "AUTO", resourceId: null, isActive: true, reservationCount: 0 },
      { id: "orphan-with-resa", source: "AUTO", resourceId: null, isActive: true, reservationCount: 3 },
      { id: "normal-slot", source: "AUTO", resourceId: "res-a", isActive: true, reservationCount: 5 },
      { id: "manual-global", source: "MANUAL", resourceId: null, isActive: true, reservationCount: 0 },
    ]
    const result = simulateCleanup(slots)
    expect(result.deleted).toEqual(["orphan-no-resa"])
    expect(result.deactivated).toEqual(["orphan-with-resa"])
  })
})

// ─── C) Capacity as maxPartySize (getEffectiveRules) ────────────────────────

interface ResourceOverrides {
  capacity?: number
  useCustomRules: boolean
  minPartySizeOverride: number | null
  maxPartySizeOverride: number | null
  slotDurationMinutesOverride: number | null
  bookingWindowDaysOverride: number | null
}

interface SettingsDefaults {
  minPartySize: number
  maxPartySize: number
  slotDurationMinutes: number
  bookingWindowDays: number
  capacityPerSlot?: number
}

interface EffectiveRules {
  minPartySize: number
  maxPartySize: number
  slotDurationMinutes: number
  bookingWindowDays: number
}

/**
 * Mirrors the updated getEffectiveRules from resource-rules.ts.
 * capacity is now the single source of truth for maxPartySize.
 */
function getEffectiveRules(
  resource: ResourceOverrides | null | undefined,
  settings: SettingsDefaults
): EffectiveRules {
  if (!resource) {
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: settings.capacityPerSlot ?? settings.maxPartySize,
      slotDurationMinutes: settings.slotDurationMinutes,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }

  const effectiveMaxPartySize = resource.capacity ?? settings.capacityPerSlot ?? settings.maxPartySize

  if (!resource.useCustomRules) {
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: effectiveMaxPartySize,
      slotDurationMinutes: settings.slotDurationMinutes,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }

  return {
    minPartySize: resource.minPartySizeOverride ?? settings.minPartySize,
    maxPartySize: effectiveMaxPartySize,
    slotDurationMinutes: resource.slotDurationMinutesOverride ?? settings.slotDurationMinutes,
    bookingWindowDays: resource.bookingWindowDaysOverride ?? settings.bookingWindowDays,
  }
}

describe("Capacity as maxPartySize (unified rules)", () => {
  const defaultSettings: SettingsDefaults = {
    minPartySize: 1,
    maxPartySize: 10,
    slotDurationMinutes: 60,
    bookingWindowDays: 30,
    capacityPerSlot: 10,
  }

  it("uses resource.capacity as maxPartySize when resource has no custom rules", () => {
    const resource: ResourceOverrides = {
      capacity: 6,
      useCustomRules: false,
      minPartySizeOverride: null,
      maxPartySizeOverride: null,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules.maxPartySize).toBe(6) // capacity, NOT maxPartySize from settings
  })

  it("uses resource.capacity even when maxPartySizeOverride is set (capacity wins)", () => {
    const resource: ResourceOverrides = {
      capacity: 4,
      useCustomRules: true,
      minPartySizeOverride: null,
      maxPartySizeOverride: 20, // this is IGNORED now
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules.maxPartySize).toBe(4) // capacity wins over maxPartySizeOverride
  })

  it("uses capacityPerSlot when no resource (global mode)", () => {
    const rules = getEffectiveRules(null, defaultSettings)
    expect(rules.maxPartySize).toBe(10) // capacityPerSlot
  })

  it("uses capacityPerSlot when no resource and capacityPerSlot differs from maxPartySize", () => {
    const settings = { ...defaultSettings, capacityPerSlot: 15, maxPartySize: 8 }
    const rules = getEffectiveRules(null, settings)
    expect(rules.maxPartySize).toBe(15) // capacityPerSlot takes precedence
  })

  it("partySize validation: rejects partySize > resource.capacity", () => {
    const resource: ResourceOverrides = {
      capacity: 5,
      useCustomRules: false,
      minPartySizeOverride: null,
      maxPartySizeOverride: null,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    const partySize = 6
    expect(partySize > rules.maxPartySize).toBe(true) // should be rejected
  })

  it("partySize validation: accepts partySize <= resource.capacity", () => {
    const resource: ResourceOverrides = {
      capacity: 5,
      useCustomRules: false,
      minPartySizeOverride: null,
      maxPartySizeOverride: null,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    const partySize = 5
    expect(partySize <= rules.maxPartySize).toBe(true) // should be accepted
  })

  it("custom rules: minPartySizeOverride still works with capacity-based maxPartySize", () => {
    const resource: ResourceOverrides = {
      capacity: 8,
      useCustomRules: true,
      minPartySizeOverride: 3,
      maxPartySizeOverride: null,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules.minPartySize).toBe(3) // from override
    expect(rules.maxPartySize).toBe(8) // from capacity
  })

  it("custom rules: slotDuration and bookingWindow overrides still work", () => {
    const resource: ResourceOverrides = {
      capacity: 6,
      useCustomRules: true,
      minPartySizeOverride: null,
      maxPartySizeOverride: null,
      slotDurationMinutesOverride: 90,
      bookingWindowDaysOverride: 14,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules.slotDurationMinutes).toBe(90)
    expect(rules.bookingWindowDays).toBe(14)
    expect(rules.maxPartySize).toBe(6) // capacity
  })
})
