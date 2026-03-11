import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit"
import { resetPasswordSchema } from "@/lib/validations"
import { hashToken } from "@/lib/email"
import bcrypt from "bcryptjs"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  // Rate limit
  const clientIP = getClientIP(request)
  const rl = await checkRateLimit(clientIP, "authStrict")
  if (!rl.success) return rateLimitResponse(rl)

  try {
    const body = await request.json()
    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: (parsed.error.issues ?? parsed.error.errors)?.[0]?.message || "Données invalides" },
        { status: 400 }
      )
    }

    const { email, token, newPassword } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    // Hash the provided token and find it in DB
    const tokenHash = hashToken(token)

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
      },
    })

    // Validate token
    if (!resetToken) {
      return NextResponse.json(
        { error: "Lien de réinitialisation invalide ou expiré." },
        { status: 400 }
      )
    }

    // Timing-safe comparison of email
    const emailMatch =
      resetToken.user.email.length === normalizedEmail.length &&
      crypto.timingSafeEqual(
        Buffer.from(resetToken.user.email),
        Buffer.from(normalizedEmail)
      )

    if (!emailMatch) {
      return NextResponse.json(
        { error: "Lien de réinitialisation invalide ou expiré." },
        { status: 400 }
      )
    }

    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: "Ce lien de réinitialisation a déjà été utilisé." },
        { status: 400 }
      )
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Ce lien de réinitialisation a expiré. Veuillez en demander un nouveau." },
        { status: 400 }
      )
    }

    if (!resetToken.user.isActive) {
      return NextResponse.json(
        { error: "Ce compte est désactivé." },
        { status: 400 }
      )
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(newPassword, 12)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all other tokens for this user
      prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.user.id,
          id: { not: resetToken.id },
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
    ])

    return NextResponse.json(
      { message: "Votre mot de passe a été réinitialisé avec succès." },
      { status: 200 }
    )
  } catch (error) {
    console.error("[reset-password] Error:", error)
    return NextResponse.json(
      { error: "Une erreur est survenue. Veuillez réessayer." },
      { status: 500 }
    )
  }
}
