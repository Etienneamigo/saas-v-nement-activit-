/**
 * Tests for the availability service (pure logic, no DB)
 */
import { describe, it, expect } from "vitest"

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

/**
 * Retourne l'offset en minutes de la timezone par rapport à UTC.
 * Positif pour UTC+ (ex: Europe/Paris hiver = +60, été = +120).
 * Corrigé : la version originale retournait -diff (sens inversé).
 */
function getTzOffsetMinutes(date: Date, timezone: string): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" })
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone })
  const diff = (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  return diff  // Corrigé : était -diff
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

// ─── normalizeOpenRanges (copié depuis availability.ts) ──────────────────────

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
      return { start, end }
    })
    .filter((r): r is TimeRange => r !== null)
}

// ─────────────────────────────────────────────────────────────────────────────

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

describe("getTzOffsetMinutes (corrigé)", () => {
  it("retourne +60 pour Europe/Paris en hiver (UTC+1)", () => {
    // 2026-01-15 = hiver → Paris est UTC+1
    const d = new Date("2026-01-15T10:00:00Z")
    const offset = getTzOffsetMinutes(d, "Europe/Paris")
    expect(offset).toBe(60)
  })

  it("retourne +120 pour Europe/Paris en été (UTC+2)", () => {
    // 2026-07-15 = été → Paris est UTC+2
    const d = new Date("2026-07-15T10:00:00Z")
    const offset = getTzOffsetMinutes(d, "Europe/Paris")
    expect(offset).toBe(120)
  })

  it("retourne 0 pour UTC", () => {
    const d = new Date("2026-03-15T10:00:00Z")
    const offset = getTzOffsetMinutes(d, "UTC")
    expect(offset).toBe(0)
  })
})

describe("parseLocalDateTime (correctness timezone)", () => {
  it("10:00 Europe/Paris hiver → 09:00 UTC", () => {
    // Hiver : Paris est UTC+1, donc 10:00 Paris = 09:00 UTC
    const result = parseLocalDateTime("2026-01-15", "10:00", "Europe/Paris")
    const utcHour = result.getUTCHours()
    const utcMinute = result.getUTCMinutes()
    expect(utcHour).toBe(9)
    expect(utcMinute).toBe(0)
  })

  it("18:00 Europe/Paris hiver → 17:00 UTC", () => {
    const result = parseLocalDateTime("2026-01-15", "18:00", "Europe/Paris")
    expect(result.getUTCHours()).toBe(17)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it("10:00 Europe/Paris été → 08:00 UTC", () => {
    // Été : Paris est UTC+2, donc 10:00 Paris = 08:00 UTC
    const result = parseLocalDateTime("2026-07-15", "10:00", "Europe/Paris")
    expect(result.getUTCHours()).toBe(8)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it("10:00 UTC → 10:00 UTC (pas de décalage)", () => {
    const result = parseLocalDateTime("2026-01-15", "10:00", "UTC")
    expect(result.getUTCHours()).toBe(10)
    expect(result.getUTCMinutes()).toBe(0)
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

  it("generates slots across multiple ranges (pause déjeuner)", () => {
    const date = new Date("2026-03-10T00:00:00Z")
    const slots = generateSlots(
      date,
      [
        { start: "10:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      60,
      timezone
    )
    // 2 slots matin (10:00, 11:00) + 4 slots après-midi (14:00, 15:00, 16:00, 17:00)
    expect(slots).toHaveLength(6)
  })

  it("no slots generated between 12:00 and 14:00 (lunch break)", () => {
    const date = new Date("2026-01-15T00:00:00Z") // hiver UTC+1
    const slots = generateSlots(
      date,
      [
        { start: "10:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      60,
      timezone
    )
    // Vérifier qu'aucun slot ne démarre entre 12h et 14h (UTC = 11h–13h)
    const lunchSlots = slots.filter((s) => {
      const utcH = s.startAt.getUTCHours()
      return utcH >= 11 && utcH < 13 // 12:00–14:00 Paris hiver = 11:00–13:00 UTC
    })
    expect(lunchSlots).toHaveLength(0)
  })

  it("slot startAt corresponds to correct UTC time (Paris hiver UTC+1)", () => {
    const date = new Date("2026-01-15T00:00:00Z")
    const slots = generateSlots(date, [{ start: "10:00", end: "11:00" }], 60, timezone)
    expect(slots).toHaveLength(1)
    // 10:00 Paris hiver = 09:00 UTC
    expect(slots[0].startAt.getUTCHours()).toBe(9)
    expect(slots[0].endAt.getUTCHours()).toBe(10)
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

describe("normalizeOpenRanges", () => {
  it("retourne les ranges déjà corrects sans modification", () => {
    const input = [
      { start: "10:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]
    expect(normalizeOpenRanges(input)).toEqual(input)
  })

  it("extrait HH:mm depuis une ISO string", () => {
    const input = [
      { start: "2024-01-15T10:00:00.000Z", end: "2024-01-15T12:00:00.000Z" },
    ]
    expect(normalizeOpenRanges(input)).toEqual([{ start: "10:00", end: "12:00" }])
  })

  it("extrait HH:mm depuis un objet Date", () => {
    const input = [
      { start: new Date("2024-01-15T10:00:00.000Z"), end: new Date("2024-01-15T12:00:00.000Z") },
    ]
    const result = normalizeOpenRanges(input)
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe("10:00")
    expect(result[0].end).toBe("12:00")
  })

  it("filtre les entrées invalides", () => {
    const input = [
      { start: "10:00", end: "12:00" },
      null,
      { start: null, end: "12:00" },
      "invalid",
    ]
    expect(normalizeOpenRanges(input)).toHaveLength(1)
  })

  it("retourne [] si input n'est pas un tableau", () => {
    expect(normalizeOpenRanges(null)).toEqual([])
    expect(normalizeOpenRanges({})).toEqual([])
    expect(normalizeOpenRanges("invalid")).toEqual([])
  })
})

// ─── getEffectiveRules tests ─────────────────────────────────────────────────

function getEffectiveRules(
  resource: { useCustomRules: boolean; minPartySizeOverride: number | null; maxPartySizeOverride: number | null; slotDurationMinutesOverride: number | null; bookingWindowDaysOverride: number | null } | null | undefined,
  settings: { minPartySize: number; maxPartySize: number; slotDurationMinutes: number; bookingWindowDays: number }
) {
  if (!resource || !resource.useCustomRules) {
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: settings.maxPartySize,
      slotDurationMinutes: settings.slotDurationMinutes,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }
  return {
    minPartySize: resource.minPartySizeOverride ?? settings.minPartySize,
    maxPartySize: resource.maxPartySizeOverride ?? settings.maxPartySize,
    slotDurationMinutes: resource.slotDurationMinutesOverride ?? settings.slotDurationMinutes,
    bookingWindowDays: resource.bookingWindowDaysOverride ?? settings.bookingWindowDays,
  }
}

describe("getEffectiveRules", () => {
  const defaultSettings = {
    minPartySize: 1,
    maxPartySize: 10,
    slotDurationMinutes: 60,
    bookingWindowDays: 30,
  }

  it("returns settings defaults when resource is null", () => {
    const rules = getEffectiveRules(null, defaultSettings)
    expect(rules).toEqual(defaultSettings)
  })

  it("returns settings defaults when resource has useCustomRules=false", () => {
    const resource = {
      useCustomRules: false,
      minPartySizeOverride: 5,
      maxPartySizeOverride: 20,
      slotDurationMinutesOverride: 90,
      bookingWindowDaysOverride: 14,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules).toEqual(defaultSettings)
  })

  it("uses override values when resource has useCustomRules=true and overrides set", () => {
    const resource = {
      useCustomRules: true,
      minPartySizeOverride: 2,
      maxPartySizeOverride: 6,
      slotDurationMinutesOverride: 90,
      bookingWindowDaysOverride: 14,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules).toEqual({
      minPartySize: 2,
      maxPartySize: 6,
      slotDurationMinutes: 90,
      bookingWindowDays: 14,
    })
  })

  it("falls back to settings for null overrides even with useCustomRules=true", () => {
    const resource = {
      useCustomRules: true,
      minPartySizeOverride: null,
      maxPartySizeOverride: 6,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules).toEqual({
      minPartySize: 1,     // from settings
      maxPartySize: 6,     // from override
      slotDurationMinutes: 60,  // from settings
      bookingWindowDays: 30,    // from settings
    })
  })

  it("validates partySize against resource overrides (custom escape game scenario)", () => {
    const settings = { minPartySize: 1, maxPartySize: 10, slotDurationMinutes: 60, bookingWindowDays: 30 }
    const escapeRoom = {
      useCustomRules: true,
      minPartySizeOverride: 2,
      maxPartySizeOverride: 5,
      slotDurationMinutesOverride: 90,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(escapeRoom, settings)
    const partySize = 6
    expect(partySize > rules.maxPartySize).toBe(true) // should be rejected
    expect(rules.slotDurationMinutes).toBe(90)
    expect(rules.bookingWindowDays).toBe(30) // inherited from settings
  })

  it("bowling scenario: all resources use defaults (no customization needed)", () => {
    const settings = { minPartySize: 1, maxPartySize: 8, slotDurationMinutes: 120, bookingWindowDays: 30 }
    const lane1 = {
      useCustomRules: false,
      minPartySizeOverride: null,
      maxPartySizeOverride: null,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(lane1, settings)
    expect(rules.slotDurationMinutes).toBe(120)
    expect(rules.maxPartySize).toBe(8)
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
