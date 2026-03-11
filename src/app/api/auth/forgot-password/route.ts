import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit"
import { forgotPasswordSchema } from "@/lib/validations"
import { generateResetToken, hashToken, sendPasswordResetEmail } from "@/lib/email"

const RESET_TOKEN_EXPIRY_MINUTES = 30

export async function POST(request: NextRequest) {
  // Rate limit
  const clientIP = getClientIP(request)
  const rl = await checkRateLimit(clientIP, "auth")
  if (!rl.success) return rateLimitResponse(rl)

  // Generic response (anti-enumeration)
  const genericResponse = NextResponse.json(
    { message: "Si cette adresse email est associée à un compte, vous recevrez un email de réinitialisation." },
    { status: 200 }
  )

  try {
    const body = await request.json()
    const parsed = forgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      // Still return generic response to prevent enumeration
      return genericResponse
    }

    const email = parsed.data.email.toLowerCase().trim()

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, isActive: true },
    })

    if (!user || !user.isActive) {
      return genericResponse
    }

    // Invalidate all previous unused tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    })

    // Generate token + store hash
    const token = generateResetToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000)

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    // Send email (non-blocking — don't fail the request if email fails)
    sendPasswordResetEmail(email, token, user.name ?? undefined).catch((err) => {
      console.error("[forgot-password] Failed to send email:", err)
    })

    return genericResponse
  } catch (error) {
    console.error("[forgot-password] Error:", error)
    return genericResponse
  }
}
