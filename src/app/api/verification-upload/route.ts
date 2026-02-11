import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit"

// Allowed document types for verification
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
]
const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(request)
  const rateLimit = await checkRateLimit(clientIP, "upload")
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit)
  }

  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 })
  }

  if (session.user.role !== "ESTABLISHMENT" || !session.user.establishmentId) {
    return NextResponse.json(
      { error: "Seuls les etablissements peuvent soumettre des documents" },
      { status: 403 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 })
    }

    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Type de fichier non autorise. Formats acceptes : PDF, JPG, PNG" },
        { status: 400 }
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Type MIME non autorise" },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Le fichier est trop volumineux (max 10 Mo)" },
        { status: 400 }
      )
    }

    // Generate safe filename with UUID
    const fileName = `${randomUUID()}.${ext}`

    // Store in PRIVATE directory (outside /public to prevent direct access)
    const uploadDir = path.join(process.cwd(), "data", "verification-uploads")
    await mkdir(uploadDir, { recursive: true })

    const filePath = path.join(uploadDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Return the storage path (not a public URL)
    return NextResponse.json({
      storagePath: `data/verification-uploads/${fileName}`,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    })
  } catch (error) {
    console.error("Verification upload error:", error)
    return NextResponse.json({ error: "Erreur lors de l'upload" }, { status: 500 })
  }
}
