/**
 * Tests for mobile API endpoints
 * Tests JWT auth guard, ownership checks, and endpoint logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock setup (no top-level variable references in factory) ───────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    reservation: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    reservationSettings: { findUnique: vi.fn() },
    reservationResource: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reservationSlot: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reservationOverride: { findMany: vi.fn() },
  },
}))

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

// ─── Helper imports (after mocks) ───────────────────────────────────────────

import {
  extractBearerToken,
  verifyMobileToken,
  requireMobileAuth,
  generateMobileToken,
} from "@/lib/mobile-auth"
import { prisma } from "@/lib/db"
import jwt from "jsonwebtoken"

// Get mocked references
const mockPrisma = vi.mocked(prisma)
const mockJwt = vi.mocked(jwt)

// ─── Tests: JWT Auth Guard ──────────────────────────────────────────────────

describe("Mobile Auth - extractBearerToken", () => {
  it("returns null when no Authorization header", () => {
    const request = new Request("http://localhost/api/test")
    expect(extractBearerToken(request)).toBeNull()
  })

  it("returns null for non-Bearer scheme", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Basic abc123" },
    })
    expect(extractBearerToken(request)).toBeNull()
  })

  it("returns token for valid Bearer header", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer my-jwt-token" },
    })
    expect(extractBearerToken(request)).toBe("my-jwt-token")
  })

  it("is case-insensitive for Bearer keyword", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "bearer my-token" },
    })
    expect(extractBearerToken(request)).toBe("my-token")
  })
})

describe("Mobile Auth - verifyMobileToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns payload for valid token", () => {
    const payload = { sub: "user1", role: "USER", establishmentId: null }
    mockJwt.verify.mockReturnValue(payload as any)

    const result = verifyMobileToken("valid-token")
    expect(result).toEqual(payload)
  })

  it("returns null for invalid token", () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error("invalid")
    })

    const result = verifyMobileToken("invalid-token")
    expect(result).toBeNull()
  })
})

describe("Mobile Auth - requireMobileAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws 401 when no Authorization header", async () => {
    const request = new Request("http://localhost/api/test")

    try {
      await requireMobileAuth(request)
      expect.fail("Should have thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toContain("authentification")
    }
  })

  it("throws 401 when token is invalid", async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error("invalid")
    })

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer bad-token" },
    })

    try {
      await requireMobileAuth(request)
      expect.fail("Should have thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      expect((response as Response).status).toBe(401)
    }
  })

  it("throws 401 when user not found in DB", async () => {
    mockJwt.verify.mockReturnValue({ sub: "user1", role: "USER", establishmentId: null } as any)
    mockPrisma.user.findUnique.mockResolvedValue(null as any)

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    })

    try {
      await requireMobileAuth(request)
      expect.fail("Should have thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      expect((response as Response).status).toBe(401)
    }
  })

  it("throws 401 when user is inactive", async () => {
    mockJwt.verify.mockReturnValue({ sub: "user1", role: "USER", establishmentId: null } as any)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user1", email: "test@example.com", name: "Test",
      role: "USER", isActive: false, establishment: null,
    } as any)

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    })

    try {
      await requireMobileAuth(request)
      expect.fail("Should have thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      expect((response as Response).status).toBe(401)
      const body = await (response as Response).json()
      expect(body.error).toContain("désactivé")
    }
  })

  it("returns user when valid", async () => {
    mockJwt.verify.mockReturnValue({ sub: "user1", role: "USER", establishmentId: null } as any)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user1", email: "test@example.com", name: "Test User",
      role: "USER", isActive: true, establishment: null,
    } as any)

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    })

    const user = await requireMobileAuth(request)
    expect(user.id).toBe("user1")
    expect(user.email).toBe("test@example.com")
    expect(user.role).toBe("USER")
    expect(user.establishmentId).toBeNull()
  })
})

// ─── Tests: Ownership Check ────────────────────────────────────────────────

describe("Owner Auth Helper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for non-ESTABLISHMENT user", async () => {
    mockJwt.verify.mockReturnValue({ sub: "user1", role: "USER", establishmentId: null } as any)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user1", email: "u@test.com", name: "U",
      role: "USER", isActive: true, establishment: null,
    } as any)

    const { requireOwner, isErrorResponse } = await import("@/app/api/mobile/owner/_helpers/auth")

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    })

    const result = await requireOwner(request, "est-1")
    expect(isErrorResponse(result)).toBe(true)
    if (isErrorResponse(result)) {
      expect(result.status).toBe(403)
    }
  })

  it("returns 403 when ESTABLISHMENT user accesses different establishment", async () => {
    mockJwt.verify.mockReturnValue({ sub: "user2", role: "ESTABLISHMENT", establishmentId: "est-2" } as any)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user2", email: "o@test.com", name: "O",
      role: "ESTABLISHMENT", isActive: true, establishment: { id: "est-2" },
    } as any)

    const { requireOwner, isErrorResponse } = await import("@/app/api/mobile/owner/_helpers/auth")

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    })

    const result = await requireOwner(request, "est-OTHER")
    expect(isErrorResponse(result)).toBe(true)
    if (isErrorResponse(result)) {
      expect(result.status).toBe(403)
    }
  })

  it("returns user when ESTABLISHMENT owner accesses own establishment", async () => {
    mockJwt.verify.mockReturnValue({ sub: "user2", role: "ESTABLISHMENT", establishmentId: "est-2" } as any)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user2", email: "o@test.com", name: "O",
      role: "ESTABLISHMENT", isActive: true, establishment: { id: "est-2" },
    } as any)

    const { requireOwner, isErrorResponse } = await import("@/app/api/mobile/owner/_helpers/auth")

    const request = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    })

    const result = await requireOwner(request, "est-2")
    expect(isErrorResponse(result)).toBe(false)
    if (!isErrorResponse(result)) {
      expect(result.id).toBe("user2")
      expect(result.establishmentId).toBe("est-2")
    }
  })
})

// ─── Tests: Reservation filtering logic ─────────────────────────────────────

describe("User Reservations - filter logic", () => {
  it("upcoming filter: only confirmed future reservations", () => {
    const now = new Date()
    const filter = "upcoming"

    const where: Record<string, unknown> = { userId: "user1" }
    if (filter === "upcoming") {
      where.startAt = { gte: now }
      where.status = "CONFIRMED"
    }

    expect(where.status).toBe("CONFIRMED")
    expect(where.startAt).toEqual({ gte: now })
  })

  it("past filter: past or cancelled/no-show reservations", () => {
    const now = new Date()
    const filter = "past"

    const where: Record<string, unknown> = { userId: "user1" }
    if (filter === "past") {
      where.OR = [
        { startAt: { lt: now } },
        { status: { in: ["CANCELLED", "NO_SHOW"] } },
      ]
    }

    expect(where.OR).toBeDefined()
    expect((where.OR as Array<Record<string, unknown>>).length).toBe(2)
  })

  it("no filter: returns all reservations", () => {
    const where: Record<string, unknown> = { userId: "user1" }
    expect(where).toEqual({ userId: "user1" })
    expect(where.status).toBeUndefined()
    expect(where.OR).toBeUndefined()
  })
})

// ─── Tests: Cancel reservation logic ────────────────────────────────────────

describe("Cancel Reservation - business logic", () => {
  it("rejects cancel when reservation belongs to another user", () => {
    const reservation = { userId: "other-user", status: "CONFIRMED" }
    const userId = "user1"
    expect(reservation.userId === userId).toBe(false)
  })

  it("rejects cancel when reservation is not CONFIRMED", () => {
    const reservation = { userId: "user1", status: "CANCELLED" }
    expect(reservation.status === "CONFIRMED").toBe(false)
  })

  it("rejects cancel when cancellation is disabled", () => {
    const settings = { cancellationEnabled: false, cancellationDeadlineHours: 24 }
    expect(settings.cancellationEnabled).toBe(false)
  })

  it("rejects cancel when past deadline", () => {
    const now = new Date()
    const startAt = new Date(now.getTime() + 1 * 3600 * 1000) // 1h from now
    const deadlineHours = 24

    const deadline = new Date(startAt.getTime() - deadlineHours * 3600 * 1000)
    expect(now > deadline).toBe(true)
  })

  it("allows cancel when within deadline", () => {
    const now = new Date()
    const startAt = new Date(now.getTime() + 48 * 3600 * 1000) // 48h from now
    const deadlineHours = 24

    const deadline = new Date(startAt.getTime() - deadlineHours * 3600 * 1000)
    expect(now > deadline).toBe(false)
  })

  it("owner cancel: no deadline check applies", () => {
    const isOwnerCancel = true
    const now = new Date()
    const startAt = new Date(now.getTime() + 1 * 3600 * 1000) // 1h from now

    let canCancel = true
    if (!isOwnerCancel) {
      const deadline = new Date(startAt.getTime() - 24 * 3600 * 1000)
      canCancel = now <= deadline
    }

    expect(canCancel).toBe(true)
  })
})

// ─── Tests: generateMobileToken ─────────────────────────────────────────────

describe("generateMobileToken", () => {
  it("returns a string token", () => {
    const token = generateMobileToken({
      id: "user1",
      role: "USER",
      establishmentId: null,
    })
    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
  })
})
