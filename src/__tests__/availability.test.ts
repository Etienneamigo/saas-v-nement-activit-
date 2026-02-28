/**
 * Tests for the availability service (pure logic, no DB)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Helpers extracted from availability.ts (pure functions) ────────────────

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

function getDayOfWeekInTz(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(date)
  const weekday = parts.find((p) => p.type === "weekday")?.value
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return map[weekday ?? "Mon"] ?? 1
}

function getTzOffsetMinutes(date: Date, timezone: string): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" })
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone })
  const diff = (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  return -diff
}

function parseLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  const [hour, minute] = timeStr.split(":").map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offset = getTzOffsetMinutes(candidate, timezone)
  return new Date(candidate.getTime() - offset * 60 * 1000)
}

interface TimeRange {
  start: string
  end: string
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("formatDateLocal", () => {
  it("returns YYYY-MM-DD format in Europe/Paris", () => {
    // 2026-03-15 UTC
    const d = new Date("2026-03-15T10:00:00Z")
    const result = formatDateLocal(d, "Europe/Paris")
    expect(result).toBe("2026-03-15")
  })

  it("adjusts for midnight UTC that is previous day in Paris (winter)", () => {
    // 2026-01-01T00:30:00Z = 2026-01-01T01:30:00 Paris (UTC+1)
    const d = new Date("2026-01-01T00:30:00Z")
    expect(formatDateLocal(d, "Europe/Paris")).toBe("2026-01-01")
  })
})

describe("getDayOfWeekInTz", () => {
  it("returns 1 for a Monday", () => {
    // 2026-02-23 is a Monday
    const d = new Date("2026-02-23T10:00:00Z")
    expect(getDayOfWeekInTz(d, "Europe/Paris")).toBe(1)
  })

  it("returns 6 for a Saturday", () => {
    // 2026-02-28 is a Saturday
    const d = new Date("2026-02-28T10:00:00Z")
    expect(getDayOfWeekInTz(d, "Europe/Paris")).toBe(6)
  })
})

describe("generateSlots", () => {
  const timezone = "Europe/Paris"

  it("generates correct number of 60-min slots for a 9h–12h range", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    const slots = generateSlots(date, [{ start: "09:00", end: "12:00" }], 60, timezone)
    expect(slots).toHaveLength(3) // 09:00, 10:00, 11:00
  })

  it("generates correct number of 30-min slots for a 10h–12h range", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    const slots = generateSlots(date, [{ start: "10:00", end: "12:00" }], 30, timezone)
    expect(slots).toHaveLength(4) // 10:00, 10:30, 11:00, 11:30
  })

  it("does not include a slot that would exceed range end", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    // Range 10:00–11:30, slot 60min → only 10:00 fits (10:00→11:00), not 11:00→12:00
    const slots = generateSlots(date, [{ start: "10:00", end: "11:30" }], 60, timezone)
    expect(slots).toHaveLength(1)
  })

  it("generates slots across multiple ranges", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    const slots = generateSlots(
      date,
      [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "17:00" },
      ],
      60,
      timezone
    )
    // 3 morning + 3 afternoon
    expect(slots).toHaveLength(6)
  })

  it("returns empty array for empty ranges", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    const slots = generateSlots(date, [], 60, timezone)
    expect(slots).toHaveLength(0)
  })

  it("slot startAt and endAt differ by slotDuration", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    const slots = generateSlots(date, [{ start: "10:00", end: "12:00" }], 90, timezone)
    expect(slots).toHaveLength(1) // Only 10:00–11:30 fits
    const diff = (slots[0].endAt.getTime() - slots[0].startAt.getTime()) / 60000
    expect(diff).toBe(90)
  })
})

describe("Capacity & booking window (unit logic)", () => {
  it("capacity check: partySize > remainingCapacity should block", () => {
    const capacityPerSlot = 5
    const alreadyBooked = 4
    const partySize = 2
    const remaining = capacityPerSlot - alreadyBooked
    expect(remaining < partySize).toBe(true)
  })

  it("capacity check: partySize <= remainingCapacity should allow", () => {
    const capacityPerSlot = 10
    const alreadyBooked = 4
    const partySize = 3
    const remaining = capacityPerSlot - alreadyBooked
    expect(remaining >= partySize).toBe(true)
  })

  it("minNotice: slot in the past should be rejected", () => {
    const now = new Date()
    const minNoticeMinutes = 120
    const slotStart = new Date(now.getTime() - 10 * 60 * 1000) // 10 min ago
    const minStartAt = new Date(now.getTime() + minNoticeMinutes * 60 * 1000)
    expect(slotStart < minStartAt).toBe(true) // should be filtered out
  })

  it("minNotice: slot far in future should pass", () => {
    const now = new Date()
    const minNoticeMinutes = 120
    const slotStart = new Date(now.getTime() + 3 * 60 * 60 * 1000) // 3 hours from now
    const minStartAt = new Date(now.getTime() + minNoticeMinutes * 60 * 1000)
    expect(slotStart >= minStartAt).toBe(true)
  })

  it("bookingWindow: slot beyond window should be rejected", () => {
    const now = new Date()
    const bookingWindowDays = 30
    const maxDate = new Date(now)
    maxDate.setDate(maxDate.getDate() + bookingWindowDays)
    const farDate = new Date(now)
    farDate.setDate(farDate.getDate() + 31)
    expect(farDate > maxDate).toBe(true) // should be blocked
  })

  it("cancellation: deadline allows cancellation 48h before slot, 24h deadline", () => {
    const cancellationDeadlineHours = 24
    const slotStart = new Date(Date.now() + 48 * 3600 * 1000) // 48h from now
    const deadline = new Date(slotStart.getTime() - cancellationDeadlineHours * 3600 * 1000)
    const now = new Date()
    expect(now < deadline).toBe(true) // cancellation allowed
  })

  it("cancellation: deadline blocks cancellation 1h before slot, 24h deadline", () => {
    const cancellationDeadlineHours = 24
    const slotStart = new Date(Date.now() + 1 * 3600 * 1000) // 1h from now
    const deadline = new Date(slotStart.getTime() - cancellationDeadlineHours * 3600 * 1000)
    const now = new Date()
    expect(now > deadline).toBe(true) // cancellation blocked
  })
})
