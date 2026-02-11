import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Security headers middleware
 * Applies security headers to all responses
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Get nonce for CSP (if needed for inline scripts)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")

  // Determine if we're in production
  const isProduction = process.env.NODE_ENV === "production"

  // Build CSP directives
  const cspDirectives = [
    // Default - fallback for other directives
    "default-src 'self'",

    // Scripts - self + Stripe + inline for Next.js hydration
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com`,

    // Styles - self + inline (for Tailwind/styled-jsx)
    "style-src 'self' 'unsafe-inline'",

    // Images - self + data URIs + blob + external
    "img-src 'self' data: blob: https:",

    // Fonts - self + Google Fonts (if used)
    "font-src 'self' data: https://fonts.gstatic.com",

    // Connect - API calls (self + Stripe + Cloudflare)
    "connect-src 'self' https://api.stripe.com https://challenges.cloudflare.com wss: https://upload.cloudflarestream.com https://upload.videodelivery.net https://*.cloudflarestream.com https://*.videodelivery.net https://upload.imagedelivery.net https://nominatim.openstreetmap.org",

    // Frames - Stripe 3DS, Cloudflare Turnstile
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",

    // Frame ancestors - prevent clickjacking
    "frame-ancestors 'self'",

    // Form actions - self only
    "form-action 'self'",

    // Base URI - prevent base tag hijacking
    "base-uri 'self'",

    // Object - disable plugins
    "object-src 'none'",

    // Media - self + blob (for video uploads)
    "media-src 'self' blob: https://*.cloudflarestream.com https://*.videodelivery.net",

    // Worker - self (for service workers if any)
    "worker-src 'self' blob:",

    // Manifest - self
    "manifest-src 'self'",

    // Upgrade insecure requests in production
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ]

  // Apply security headers
  const headers = response.headers

  // Content Security Policy
  headers.set("Content-Security-Policy", cspDirectives.join("; "))

  // Strict Transport Security (HSTS) - only in production with HTTPS
  if (isProduction) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    )
  }

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff")

  // Prevent clickjacking (backup for CSP frame-ancestors)
  headers.set("X-Frame-Options", "SAMEORIGIN")

  // XSS Protection (legacy but still useful for old browsers)
  headers.set("X-XSS-Protection", "1; mode=block")

  // Referrer Policy - send origin only for cross-origin requests
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

  // Permissions Policy - disable unnecessary features
  headers.set(
    "Permissions-Policy",
    [
      "accelerometer=()",
      "camera=()",
      "geolocation=(self)", // Allow for location-based search
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=(self)", // Allow for Stripe
      "usb=()",
    ].join(", ")
  )

  // Cross-Origin policies
  headers.set("Cross-Origin-Opener-Policy", "same-origin")
  headers.set("Cross-Origin-Resource-Policy", "same-origin")

  // Store nonce for use in pages (if needed)
  headers.set("X-Nonce", nonce)

  return response
}

// Apply middleware to all routes except static files and api health
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
