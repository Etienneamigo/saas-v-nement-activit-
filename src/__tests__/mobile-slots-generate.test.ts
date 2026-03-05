/**
 * Tests for POST /api/mobile/owner/establishments/[id]/slots
 * Validates the Zod union: generate mode vs create mode.
 */
import { describe, it, expect } from "vitest"
import { z } from "zod"

// ─── Reproduce the schemas from the route ────────────────────────────────────

const createSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  isActive: z.boolean().default(true),
  resourceId: z.string().cuid().optional().nullable(),
})

const generateSchema = z.object({
  action: z.literal("generate"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),
})

const bodySchema = z.union([generateSchema, createSchema])

// ─── Tests: generate schema ─────────────────────────────────────────────────

describe("POST /slots body schema - generate mode", () => {
  it("accepts valid generate payload", () => {
    const result = bodySchema.safeParse({
      action: "generate",
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        action: "generate",
        dateFrom: "2025-06-01",
        dateTo: "2025-06-30",
      })
    }
  })

  it("does NOT require startAt/endAt/capacity for generate", () => {
    const result = bodySchema.safeParse({
      action: "generate",
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    })
    expect(result.success).toBe(true)
  })

  it("rejects generate with missing dateFrom", () => {
    const result = generateSchema.safeParse({
      action: "generate",
      dateTo: "2025-06-30",
    })
    expect(result.success).toBe(false)
  })

  it("rejects generate with missing dateTo", () => {
    const result = generateSchema.safeParse({
      action: "generate",
      dateFrom: "2025-06-01",
    })
    expect(result.success).toBe(false)
  })

  it("rejects generate with invalid date format", () => {
    const result = generateSchema.safeParse({
      action: "generate",
      dateFrom: "2025/06/01",
      dateTo: "2025-06-30",
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown action", () => {
    const result = bodySchema.safeParse({
      action: "unknown",
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    })
    expect(result.success).toBe(false)
  })
})

// ─── Tests: create schema ───────────────────────────────────────────────────

describe("POST /slots body schema - create mode", () => {
  it("accepts valid create payload", () => {
    const result = bodySchema.safeParse({
      startAt: "2025-06-15T10:00:00.000Z",
      endAt: "2025-06-15T11:00:00.000Z",
      capacity: 10,
    })
    expect(result.success).toBe(true)
  })

  it("accepts create with optional fields", () => {
    const result = bodySchema.safeParse({
      startAt: "2025-06-15T10:00:00.000Z",
      endAt: "2025-06-15T11:00:00.000Z",
      capacity: 10,
      isActive: false,
      resourceId: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects create with missing capacity", () => {
    const result = createSchema.safeParse({
      startAt: "2025-06-15T10:00:00.000Z",
      endAt: "2025-06-15T11:00:00.000Z",
    })
    expect(result.success).toBe(false)
  })

  it("rejects create with capacity < 1", () => {
    const result = createSchema.safeParse({
      startAt: "2025-06-15T10:00:00.000Z",
      endAt: "2025-06-15T11:00:00.000Z",
      capacity: 0,
    })
    expect(result.success).toBe(false)
  })
})

// ─── Tests: union discrimination ────────────────────────────────────────────

describe("POST /slots body schema - union discrimination", () => {
  it("routes to generate when action=generate is present", () => {
    const result = bodySchema.safeParse({
      action: "generate",
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    })
    expect(result.success).toBe(true)
    if (result.success && "action" in result.data) {
      expect(result.data.action).toBe("generate")
    }
  })

  it("routes to create when no action field", () => {
    const result = bodySchema.safeParse({
      startAt: "2025-06-15T10:00:00.000Z",
      endAt: "2025-06-15T11:00:00.000Z",
      capacity: 5,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect("action" in result.data).toBe(false)
      expect("startAt" in result.data).toBe(true)
    }
  })

  it("rejects empty body", () => {
    const result = bodySchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
