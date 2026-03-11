/**
 * Password reset flow tests:
 * 1. forgot-password returns 200 even if email doesn't exist (anti-enumeration)
 * 2. reset-password rejects invalid/expired tokens
 * 3. reset-password accepts valid token and changes password
 * 4. token cannot be reused
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import crypto from "crypto"

// ─── Hoisted mocks (accessible inside vi.mock factories) ───────────────────

const { prismaMock, rateLimitMock } = vi.hoisted(() => {
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  }

  const rateLimitMock = {
    checkRateLimit: vi.fn(async () => ({
      success: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60000),
      limit: 5,
    })),
    getClientIP: vi.fn(() => "127.0.0.1"),
    rateLimitResponse: vi.fn(),
  }

  return { prismaMock, rateLimitMock }
})

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/rate-limit", () => rateLimitMock)

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>()
  return {
    ...actual,
    sendPasswordResetEmail: vi.fn(async () => true),
  }
})

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "$2a$12$newhash"),
    compare: vi.fn(async () => true),
  },
}))

// ─── Test data ──────────────────────────────────────────────────────────────

const validToken = crypto.randomBytes(32).toString("hex")
const validTokenHash = crypto.createHash("sha256").update(validToken).digest("hex")

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test",
  isActive: true,
  passwordHash: "$2a$12$fakehash",
}

const mockResetToken = {
  id: "token-1",
  userId: "user-1",
  tokenHash: validTokenHash,
  expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  usedAt: null,
  createdAt: new Date(),
  user: { id: "user-1", email: "test@example.com", isActive: true },
}

// ─── Import route handlers after mocks ──────────────────────────────────────

import { POST as forgotPasswordHandler } from "@/app/api/auth/forgot-password/route"
import { POST as resetPasswordHandler } from "@/app/api/auth/reset-password/route"

function makeRequest(body: object): Request {
  return new Request("http://localhost:3000", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 200 with generic message even if email does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const req = makeRequest({ email: "nonexistent@example.com" })
    const res = await forgotPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toBeDefined()
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled()
  })

  it("returns 200 and creates token for existing user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser)
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.passwordResetToken.create.mockResolvedValue(mockResetToken)

    const req = makeRequest({ email: "test@example.com" })
    const res = await forgotPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toBeDefined()
    expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalled()
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalled()
  })

  it("returns 200 for invalid email format (anti-enumeration)", async () => {
    const req = makeRequest({ email: "not-an-email" })
    const res = await forgotPasswordHandler(req as any)

    expect(res.status).toBe(200)
  })
})

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects invalid token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null)

    const req = makeRequest({
      email: "test@example.com",
      token: "invalid-token",
      newPassword: "NewPass123",
    })
    const res = await resetPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it("rejects expired token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      ...mockResetToken,
      expiresAt: new Date(Date.now() - 1000),
    })

    const req = makeRequest({
      email: "test@example.com",
      token: validToken,
      newPassword: "NewPass123",
    })
    const res = await resetPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain("expiré")
  })

  it("accepts valid token and changes password", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({ ...mockResetToken })
    prismaMock.$transaction.mockResolvedValue([{}, {}, {}])

    const req = makeRequest({
      email: "test@example.com",
      token: validToken,
      newPassword: "NewPass123",
    })
    const res = await resetPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toContain("succès")
  })

  it("rejects already used token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      ...mockResetToken,
      usedAt: new Date(),
    })

    const req = makeRequest({
      email: "test@example.com",
      token: validToken,
      newPassword: "NewPass123",
    })
    const res = await resetPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain("déjà été utilisé")
  })

  it("rejects weak password (no digit)", async () => {
    const req = makeRequest({
      email: "test@example.com",
      token: validToken,
      newPassword: "NoDigitsHere",
    })
    const res = await resetPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it("rejects short password", async () => {
    const req = makeRequest({
      email: "test@example.com",
      token: validToken,
      newPassword: "Ab1",
    })
    const res = await resetPasswordHandler(req as any)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBeDefined()
  })
})
