/**
 * Security regression tests for P1 fixes:
 * 1. IDOR: CustomFieldDef ownership enforcement
 * 2. PATCH establishment: Zod validation (unknown fields, URL format)
 * 3. Date validation: invalid dateFrom/dateTo returns 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock setup ─────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => {
  const txProxy: Record<string, ReturnType<typeof vi.fn>> = {
    reservationSettings: { upsert: vi.fn() },
    weeklySchedule: { deleteMany: vi.fn(), createMany: vi.fn() },
    reservationCustomFieldDef: {
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  } as any

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: typeof txProxy) => Promise<void>) => fn(txProxy)),
      reservationSettings: { findUnique: vi.fn(), upsert: vi.fn() },
      reservationCustomFieldDef: {
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      weeklySchedule: { deleteMany: vi.fn(), createMany: vi.fn() },
      reservationOverride: { findMany: vi.fn() },
      reservation: { findMany: vi.fn() },
      reservationResource: { count: vi.fn() },
      reservationSlot: { findMany: vi.fn() },
      establishment: { update: vi.fn(), findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      _txProxy: txProxy,
    },
  }
})

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(() => "mock-token"),
    verify: vi.fn(),
    TokenExpiredError: class TokenExpiredError extends Error { name = "TokenExpiredError" },
    JsonWebTokenError: class JsonWebTokenError extends Error { name = "JsonWebTokenError" },
  },
}))

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ success: true })),
  getClientIP: vi.fn(() => "127.0.0.1"),
  rateLimitResponse: vi.fn(),
}))

import { prisma } from "@/lib/db"
import jwt from "jsonwebtoken"

const mockPrisma = vi.mocked(prisma) as any
const mockJwt = vi.mocked(jwt)

function setupOwnerAuth(userId: string, establishmentId: string) {
  mockJwt.verify.mockReturnValue({
    sub: userId,
    role: "ESTABLISHMENT",
    establishmentId,
  } as any)
  mockPrisma.user.findUnique.mockResolvedValue({
    id: userId,
    email: `${userId}@test.com`,
    name: "Owner",
    role: "ESTABLISHMENT",
    isActive: true,
    establishment: { id: establishmentId },
  } as any)
}

function ownerRequest(url: string, opts?: RequestInit) {
  return new Request(url, {
    ...opts,
    headers: { Authorization: "Bearer valid-token", ...(opts?.headers || {}) },
  })
}

// ─── 1. IDOR: CustomFieldDef ownership ─────────────────────────────────────

describe("P1 IDOR — CustomFieldDef update must enforce settingsId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects update of a fieldDef that belongs to another establishment (IDOR blocked)", async () => {
    // Setup: ownerA owns estab-A
    setupOwnerAuth("userA", "estab-A")

    const settingsA = { id: "settings-A", establishmentId: "estab-A" }

    // The tx proxy simulates the transaction
    const txProxy = mockPrisma._txProxy
    txProxy.reservationSettings.upsert.mockResolvedValue(settingsA)
    txProxy.weeklySchedule.deleteMany.mockResolvedValue({ count: 0 })
    txProxy.reservationCustomFieldDef.deleteMany.mockResolvedValue({ count: 0 })
    // Key: updateMany returns count=0 because fieldDef-B doesn't belong to settings-A
    txProxy.reservationCustomFieldDef.updateMany.mockResolvedValue({ count: 0 })

    const { PUT } = await import(
      "@/app/api/mobile/owner/establishments/[id]/reservations/settings/route"
    )

    const body = {
      enabled: true,
      timezone: "Europe/Paris",
      slotDurationMinutes: 60,
      capacityPerSlot: 10,
      minPartySize: 1,
      maxPartySize: 10,
      minNoticeMinutes: 120,
      bookingWindowDays: 30,
      cancellationEnabled: true,
      cancellationDeadlineHours: 24,
      resourceSelectionMode: "HIDDEN",
      weeklySchedule: {},
      customFieldDefs: [
        {
          id: "fieldDef-B-from-other-estab", // belongs to another establishment!
          label: "Hacked",
          type: "TEXT",
          required: false,
          order: 0,
        },
      ],
    }

    const request = ownerRequest("http://localhost/api/mobile/owner/establishments/estab-A/reservations/settings", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
    })

    const response = await PUT(request, { params: Promise.resolve({ id: "estab-A" }) })
    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.error).toContain("access denied")
  })

  it("allows update of own fieldDef (no IDOR)", async () => {
    setupOwnerAuth("userA", "estab-A")

    const settingsA = { id: "settings-A", establishmentId: "estab-A" }
    const txProxy = mockPrisma._txProxy
    txProxy.reservationSettings.upsert.mockResolvedValue(settingsA)
    txProxy.weeklySchedule.deleteMany.mockResolvedValue({ count: 0 })
    txProxy.reservationCustomFieldDef.deleteMany.mockResolvedValue({ count: 0 })
    // count=1 means the field belongs to this settings — update succeeds
    txProxy.reservationCustomFieldDef.updateMany.mockResolvedValue({ count: 1 })

    mockPrisma.reservationSettings.findUnique.mockResolvedValue({
      ...settingsA,
      weeklySchedule: [],
      customFieldDefs: [],
    })

    const { PUT } = await import(
      "@/app/api/mobile/owner/establishments/[id]/reservations/settings/route"
    )

    const body = {
      enabled: true,
      timezone: "Europe/Paris",
      slotDurationMinutes: 60,
      capacityPerSlot: 10,
      minPartySize: 1,
      maxPartySize: 10,
      minNoticeMinutes: 120,
      bookingWindowDays: 30,
      cancellationEnabled: true,
      cancellationDeadlineHours: 24,
      resourceSelectionMode: "HIDDEN",
      weeklySchedule: {},
      customFieldDefs: [
        {
          id: "my-own-field-A",
          label: "My Field",
          type: "TEXT",
          required: false,
          order: 0,
        },
      ],
    }

    const request = ownerRequest("http://localhost/api/mobile/owner/establishments/estab-A/reservations/settings", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
    })

    const response = await PUT(request, { params: Promise.resolve({ id: "estab-A" }) })
    expect(response.status).toBe(200)
  })
})

// ─── 2. PATCH establishment: Zod validation ────────────────────────────────

describe("P1 PATCH establishment — Zod strict validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects unknown fields (strict mode)", async () => {
    setupOwnerAuth("userA", "estab-A")

    const { PATCH } = await import("@/app/api/mobile/establishment/route")

    const request = ownerRequest("http://localhost/api/mobile/establishment", {
      method: "PATCH",
      body: JSON.stringify({ name: "OK", hackerField: "injected" }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
    })

    const response = await PATCH(request)
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toBeDefined()
  })

  it("rejects invalid URL for website", async () => {
    setupOwnerAuth("userA", "estab-A")

    const { PATCH } = await import("@/app/api/mobile/establishment/route")

    const request = ownerRequest("http://localhost/api/mobile/establishment", {
      method: "PATCH",
      body: JSON.stringify({ website: "not-a-url" }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
    })

    const response = await PATCH(request)
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain("URL")
  })

  it("accepts valid partial update", async () => {
    setupOwnerAuth("userA", "estab-A")
    mockPrisma.establishment.update.mockResolvedValue({ id: "estab-A", name: "New Name" })

    const { PATCH } = await import("@/app/api/mobile/establishment/route")

    const request = ownerRequest("http://localhost/api/mobile/establishment", {
      method: "PATCH",
      body: JSON.stringify({ name: "New Name" }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
    })

    const response = await PATCH(request)
    expect(response.status).toBe(200)
  })

  it("accepts empty string for website (clears the field)", async () => {
    setupOwnerAuth("userA", "estab-A")
    mockPrisma.establishment.update.mockResolvedValue({ id: "estab-A", website: null })

    const { PATCH } = await import("@/app/api/mobile/establishment/route")

    const request = ownerRequest("http://localhost/api/mobile/establishment", {
      method: "PATCH",
      body: JSON.stringify({ website: "" }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
    })

    const response = await PATCH(request)
    expect(response.status).toBe(200)
  })
})

// ─── 3. Date validation ────────────────────────────────────────────────────

describe("P1 Date validation — validateDateRange", () => {
  it("rejects invalid dateFrom", async () => {
    const { validateDateRange } = await import("@/lib/validations")
    const result = validateDateRange("not-a-date", undefined)
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("dateFrom")
    }
  })

  it("rejects invalid dateTo", async () => {
    const { validateDateRange } = await import("@/lib/validations")
    const result = validateDateRange(undefined, "xyz")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("dateTo")
    }
  })

  it("rejects dateFrom > dateTo", async () => {
    const { validateDateRange } = await import("@/lib/validations")
    const result = validateDateRange("2025-12-31", "2025-01-01")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("antérieure")
    }
  })

  it("accepts valid date range", async () => {
    const { validateDateRange } = await import("@/lib/validations")
    const result = validateDateRange("2025-01-01", "2025-12-31")
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.from).toBeInstanceOf(Date)
      expect(result.to).toBeInstanceOf(Date)
    }
  })

  it("accepts undefined dates (no filtering)", async () => {
    const { validateDateRange } = await import("@/lib/validations")
    const result = validateDateRange(undefined, undefined)
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.from).toBeUndefined()
      expect(result.to).toBeUndefined()
    }
  })
})
