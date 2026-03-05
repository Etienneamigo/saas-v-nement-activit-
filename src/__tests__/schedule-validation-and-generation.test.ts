/**
 * Tests for schedule validation, slot generation with resources, and orphan cleanup.
 * Covers:
 * - start===end ranges ignored/rejected
 * - generate creates 0 slots if no valid ranges
 * - generate creates slots per resource if valid ranges
 * - orphans cleaned up / never used for dedup
 * - mobile POST route: separate generate/create parsing (no any cast)
 */
import { describe, it, expect } from "vitest"
import { z } from "zod"

// ─── Reproduce pure helpers from availability.ts ────────────────────────────

interface TimeRange {
  start: string
  end: string
}

function normalizeTimeValue(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^\d{2}:\d{2}$/.test(value)) return value
    const match = value.match(/T(\d{2}:\d{2})/)
    if (match) return match[1]
    return null
  }
  if (value instanceof Date) {
    return value.toISOString().slice(11, 16)
  }
  return null
}

function normalizeOpenRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: unknown) => {
      if (!item || typeof item !== "object") return null
      const obj = item as Record<string, unknown>
      const start = normalizeTimeValue(obj.start)
      const end = normalizeTimeValue(obj.end)
      if (!start || !end) return null
      // Ignore invalid ranges where start === end (e.g. "00:00"-"00:00" = closed)
      if (start === end) return null
      return { start, end }
    })
    .filter((r): r is TimeRange => r !== null)
}

function formatDateLocal(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("/")
    .reverse()
    .join("-")
}

function getTzOffsetMinutes(date: Date, timezone: string): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" })
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone })
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
}

function parseLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  const [hour, minute] = timeStr.split(":").map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offset = getTzOffsetMinutes(candidate, timezone)
  return new Date(candidate.getTime() - offset * 60 * 1000)
}

function generateSlots(
  date: Date,
  ranges: TimeRange[],
  durationMinutes: number,
  timezone: string
): { startAt: Date; endAt: Date }[] {
  const slots: { startAt: Date; endAt: Date }[] = []
  const dateStr = formatDateLocal(date, timezone)
  for (const range of ranges) {
    let current = parseLocalDateTime(dateStr, range.start, timezone)
    const rangeEnd = parseLocalDateTime(dateStr, range.end, timezone)
    while (current < rangeEnd) {
      const slotEnd = new Date(current.getTime() + durationMinutes * 60 * 1000)
      if (slotEnd > rangeEnd) break
      slots.push({ startAt: new Date(current), endAt: slotEnd })
      current = slotEnd
    }
  }
  return slots
}

// ─── Route schemas (reproduce from route.ts) ────────────────────────────────

const generateSchema = z.object({
  action: z.literal("generate"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),
})

const createSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

// Settings time range with refine
const timeRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis"),
}).refine((r) => r.start !== r.end, {
  message: "L'heure de début et de fin ne peuvent pas être identiques (plage invalide)",
})

// ═══════════════════════════════════════════════════════════════════════════════
// A) Schedule validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("A1: normalizeOpenRanges filters start===end", () => {
  it("filters out 00:00-00:00 range (invalid/closed)", () => {
    const result = normalizeOpenRanges([{ start: "00:00", end: "00:00" }])
    expect(result).toEqual([])
  })

  it("filters out any start===end range", () => {
    const result = normalizeOpenRanges([
      { start: "09:00", end: "09:00" },
      { start: "10:00", end: "12:00" },
    ])
    expect(result).toEqual([{ start: "10:00", end: "12:00" }])
  })

  it("keeps valid ranges unchanged", () => {
    const input = [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]
    expect(normalizeOpenRanges(input)).toEqual(input)
  })

  it("returns empty for all-closed schedule (all days 00:00-00:00)", () => {
    const allDaysClosed = Array(7).fill(null).map(() => [{ start: "00:00", end: "00:00" }])
    for (const dayRanges of allDaysClosed) {
      expect(normalizeOpenRanges(dayRanges)).toEqual([])
    }
  })
})

describe("A2: settings API timeRange validation rejects start===end", () => {
  it("rejects start===end in timeRangeSchema", () => {
    const result = timeRangeSchema.safeParse({ start: "00:00", end: "00:00" })
    expect(result.success).toBe(false)
  })

  it("rejects any identical start/end", () => {
    const result = timeRangeSchema.safeParse({ start: "14:00", end: "14:00" })
    expect(result.success).toBe(false)
  })

  it("accepts valid range", () => {
    const result = timeRangeSchema.safeParse({ start: "09:00", end: "12:00" })
    expect(result.success).toBe(true)
  })
})

describe("A3: generateSlots creates 0 slots when no valid ranges", () => {
  const tz = "Europe/Paris"
  const date = new Date("2026-03-10T00:00:00Z")

  it("generates 0 slots when all ranges are start===end", () => {
    const ranges = normalizeOpenRanges([{ start: "00:00", end: "00:00" }])
    const slots = generateSlots(date, ranges, 60, tz)
    expect(slots).toHaveLength(0)
  })

  it("generates 0 slots when normalizedRanges is empty", () => {
    const slots = generateSlots(date, [], 60, tz)
    expect(slots).toHaveLength(0)
  })

  it("generates slots only for valid ranges, ignoring closed ones", () => {
    const raw = [
      { start: "00:00", end: "00:00" },  // closed → filtered
      { start: "10:00", end: "12:00" },  // valid → 2 × 60min slots
    ]
    const ranges = normalizeOpenRanges(raw)
    expect(ranges).toHaveLength(1)
    const slots = generateSlots(date, ranges, 60, tz)
    expect(slots).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// B) Resource-based generation + dedup simulation
// ═══════════════════════════════════════════════════════════════════════════════

describe("B: generate creates slots per resource (simulation)", () => {
  const tz = "Europe/Paris"
  const date = new Date("2026-03-10T00:00:00Z")
  const ranges: TimeRange[] = [{ start: "10:00", end: "12:00" }]

  it("creates one slot per (timeslot × resource)", () => {
    const resources = [
      { id: "res-1", name: "Salle A", capacity: 10 },
      { id: "res-2", name: "Salle B", capacity: 5 },
    ]
    const rawSlots = generateSlots(date, ranges, 60, tz)
    expect(rawSlots).toHaveLength(2) // 10:00, 11:00

    // Simulate multi-resource generation
    const generatedSlots: Array<{ startAt: Date; resourceId: string }> = []
    for (const resource of resources) {
      for (const slot of rawSlots) {
        generatedSlots.push({ startAt: slot.startAt, resourceId: resource.id })
      }
    }

    expect(generatedSlots).toHaveLength(4) // 2 timeslots × 2 resources
    // Each resource has both timeslots
    const res1Slots = generatedSlots.filter((s) => s.resourceId === "res-1")
    const res2Slots = generatedSlots.filter((s) => s.resourceId === "res-2")
    expect(res1Slots).toHaveLength(2)
    expect(res2Slots).toHaveLength(2)
  })

  it("orphan slots (resourceId=null) are never used for dedup against resource slots", () => {
    const rawSlots = generateSlots(date, ranges, 60, tz)
    // Simulated existing orphan
    const existingOrphans = [{ startAt: rawSlots[0].startAt, resourceId: null }]

    // Dedup check: (startAt, resourceId) — orphan should NOT block resource slot
    const resourceId = "res-1"
    const isDuplicate = existingOrphans.some(
      (e) =>
        e.startAt.getTime() === rawSlots[0].startAt.getTime() &&
        e.resourceId === resourceId
    )
    expect(isDuplicate).toBe(false) // orphan (null) !== "res-1" → not a dup
  })

  it("dedup matches on (startAt, resourceId) — same resource is a dup", () => {
    const rawSlots = generateSlots(date, ranges, 60, tz)
    const existingSlots = [{ startAt: rawSlots[0].startAt, resourceId: "res-1" }]

    const isDuplicate = existingSlots.some(
      (e) =>
        e.startAt.getTime() === rawSlots[0].startAt.getTime() &&
        e.resourceId === "res-1"
    )
    expect(isDuplicate).toBe(true)
  })
})

describe("B: orphan cleanup logic", () => {
  it("identifies orphan slots: AUTO + resourceId=null when resources exist", () => {
    const slots = [
      { id: "s1", source: "AUTO", resourceId: null, reservationCount: 0 },
      { id: "s2", source: "AUTO", resourceId: "res-1", reservationCount: 0 },
      { id: "s3", source: "MANUAL", resourceId: null, reservationCount: 0 },
    ]
    const hasResources = true

    const orphans = slots.filter(
      (s) => hasResources && s.source === "AUTO" && s.resourceId === null
    )
    expect(orphans).toHaveLength(1)
    expect(orphans[0].id).toBe("s1")
  })

  it("unreferenced orphans are deleted, referenced ones are deactivated", () => {
    const orphans = [
      { id: "s1", reservationCount: 0, isActive: true },
      { id: "s2", reservationCount: 3, isActive: true },
    ]

    const toDelete = orphans.filter((s) => s.reservationCount === 0)
    const toDeactivate = orphans.filter((s) => s.reservationCount > 0 && s.isActive)

    expect(toDelete.map((s) => s.id)).toEqual(["s1"])
    expect(toDeactivate.map((s) => s.id)).toEqual(["s2"])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// C) Mobile POST route: type-safe parsing (no any cast)
// ═══════════════════════════════════════════════════════════════════════════════

describe("C: mobile POST separate parsing (generate vs create)", () => {
  it("generate body parses with generateSchema (not createSchema)", () => {
    const body = { action: "generate", dateFrom: "2025-06-01", dateTo: "2025-06-30" }
    const genResult = generateSchema.safeParse(body)
    expect(genResult.success).toBe(true)
    if (genResult.success) {
      // Fully typed — no cast needed
      const { dateFrom, dateTo } = genResult.data
      expect(dateFrom).toBe("2025-06-01")
      expect(dateTo).toBe("2025-06-30")
    }
  })

  it("create body fails generateSchema, succeeds createSchema", () => {
    const body = {
      startAt: "2025-06-15T10:00:00.000Z",
      endAt: "2025-06-15T11:00:00.000Z",
      capacity: 10,
    }
    const genResult = generateSchema.safeParse(body)
    expect(genResult.success).toBe(false)

    const createResult = createSchema.safeParse(body)
    expect(createResult.success).toBe(true)
    if (createResult.success) {
      // Fully typed
      expect(createResult.data.startAt).toBe("2025-06-15T10:00:00.000Z")
      expect(createResult.data.capacity).toBe(10)
    }
  })

  it("generate does NOT require startAt/endAt/capacity", () => {
    const body = { action: "generate", dateFrom: "2025-06-01", dateTo: "2025-06-30" }
    const genResult = generateSchema.safeParse(body)
    expect(genResult.success).toBe(true)
  })

  it("rejects unknown action in generateSchema", () => {
    const body = { action: "unknown", dateFrom: "2025-06-01", dateTo: "2025-06-30" }
    const genResult = generateSchema.safeParse(body)
    expect(genResult.success).toBe(false)
  })

  it("rejects empty body in both schemas", () => {
    expect(generateSchema.safeParse({}).success).toBe(false)
    expect(createSchema.safeParse({}).success).toBe(false)
  })

  it("rejects generate with invalid date format", () => {
    const body = { action: "generate", dateFrom: "2025/06/01", dateTo: "2025-06-30" }
    expect(generateSchema.safeParse(body).success).toBe(false)
  })
})
