import nodemailer from "nodemailer"
import crypto from "crypto"

// Check required environment variables
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587")
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASSWORD = process.env.SMTP_PASSWORD
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER

// Create reusable transporter
function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.warn("SMTP not configured - emails will not be sent")
    return null
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  })
}

const transporter = createTransporter()

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (!transporter) {
    console.error("Email transporter not configured")
    return false
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""), // Strip HTML for plain text version
    })
    console.log(`Email sent to ${to}: ${subject}`)
    return true
  } catch (error) {
    console.error("Error sending email:", error)
    return false
  }
}

// Generate a random verification token
export function generateVerificationToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let token = ""
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

// Generate a cryptographically secure reset token
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

// Hash a token with SHA-256 for secure storage
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// Send verification email
export async function sendVerificationEmail(
  email: string,
  token: string,
  name?: string
): Promise<boolean> {
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"
  const verificationUrl = `${baseUrl}/auth/verification?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verifiez votre email</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin-bottom: 10px;">WADELO</h1>
      </div>

      <h2 style="color: #333;">Bienvenue${name ? ` ${name}` : ""} !</h2>

      <p>Merci de vous etre inscrit sur notre plateforme. Pour activer votre compte, veuillez cliquer sur le bouton ci-dessous :</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}"
           style="display: inline-block; background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Verifier mon email
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
      </p>
      <p style="color: #666; font-size: 12px; word-break: break-all;">
        ${verificationUrl}
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #999; font-size: 12px;">
        Ce lien expire dans 24 heures. Si vous n'avez pas cree de compte, vous pouvez ignorer cet email.
      </p>
    </body>
    </html>
  `

  return sendEmail({
    to: email,
    subject: "Verifiez votre email - Wadelo",
    html,
  })
}

// Send password reset email
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name?: string
): Promise<boolean> {
  const baseUrl = process.env.APP_BASE_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"
  const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

  // Dev fallback: log link to console if SMTP not configured
  if (!transporter) {
    if (process.env.NODE_ENV === "development") {
      console.log(`\n[DEV] Password reset link for ${email}:\n${resetUrl}\n`)
    }
    return false
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Réinitialiser votre mot de passe</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin-bottom: 10px;">WADELO</h1>
      </div>

      <h2 style="color: #333;">Réinitialiser votre mot de passe</h2>

      <p>Bonjour${name ? ` ${name}` : ""},</p>

      <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Réinitialiser mon mot de passe
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
      </p>
      <p style="color: #666; font-size: 12px; word-break: break-all;">
        ${resetUrl}
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #999; font-size: 12px;">
        Ce lien expire dans 30 minutes. Si vous n'avez pas demandé de réinitialisation, vous pouvez ignorer cet email.
      </p>
    </body>
    </html>
  `

  return sendEmail({
    to: email,
    subject: "Réinitialiser votre mot de passe - Wadelo",
    html,
  })
}
