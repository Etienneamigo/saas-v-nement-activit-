/**
 * Tests for resource helpers:
 * - safeParseInt (prevents NaN crashes in resource form)
 * - getEffectiveRules (resource custom rules fallback)
 */
import { describe, it, expect } from "vitest"
import { safeParseInt } from "@/lib/parse-utils"
import { getEffectiveRules } from "@/lib/resource-rules"

// ─── safeParseInt ──────────────────────────────────────────────────────────

describe("safeParseInt", () => {
  it("parses valid integer strings", () => {
    expect(safeParseInt("10")).toBe(10)
    expect(safeParseInt("1")).toBe(1)
    expect(safeParseInt("999")).toBe(999)
    expect(safeParseInt("0")).toBe(0)
  })

  it("returns undefined for empty or whitespace strings", () => {
    expect(safeParseInt("")).toBeUndefined()
    expect(safeParseInt("  ")).toBeUndefined()
  })

  it("returns undefined for non-numeric strings", () => {
    expect(safeParseInt("abc")).toBeUndefined()
    expect(safeParseInt("__default__")).toBeUndefined()
  })

  it("handles leading/trailing whitespace in numeric strings", () => {
    expect(safeParseInt(" 42 ")).toBe(42)
  })

  it("handles negative numbers", () => {
    expect(safeParseInt("-5")).toBe(-5)
  })

  it("truncates floats to integers", () => {
    expect(safeParseInt("3.7")).toBe(3)
  })
})

// ─── getEffectiveRules ───────────────────────────────────────────────────────

describe("getEffectiveRules", () => {
  const defaultSettings = {
    minPartySize: 1,
    maxPartySize: 10,
    slotDurationMinutes: 60,
    bookingWindowDays: 30,
  }

  it("returns defaults when resource is null", () => {
    const rules = getEffectiveRules(null, defaultSettings)
    expect(rules).toEqual(defaultSettings)
  })

  it("returns defaults when resource is undefined", () => {
    const rules = getEffectiveRules(undefined, defaultSettings)
    expect(rules).toEqual(defaultSettings)
  })

  it("returns defaults when useCustomRules is false", () => {
    const resource = {
      useCustomRules: false,
      minPartySizeOverride: 5,
      maxPartySizeOverride: 20,
      slotDurationMinutesOverride: 30,
      bookingWindowDaysOverride: 14,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules).toEqual(defaultSettings)
  })

  it("returns overrides when useCustomRules is true", () => {
    const resource = {
      useCustomRules: true,
      minPartySizeOverride: 2,
      maxPartySizeOverride: 8,
      slotDurationMinutesOverride: 45,
      bookingWindowDaysOverride: 14,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules).toEqual({
      minPartySize: 2,
      maxPartySize: 8,
      slotDurationMinutes: 45,
      bookingWindowDays: 14,
    })
  })

  it("falls back to defaults for null overrides when useCustomRules is true", () => {
    const resource = {
      useCustomRules: true,
      minPartySizeOverride: null,
      maxPartySizeOverride: 5,
      slotDurationMinutesOverride: null,
      bookingWindowDaysOverride: null,
    }
    const rules = getEffectiveRules(resource, defaultSettings)
    expect(rules).toEqual({
      minPartySize: 1,       // from default
      maxPartySize: 5,       // from override
      slotDurationMinutes: 60, // from default
      bookingWindowDays: 30,   // from default
    })
  })
})
