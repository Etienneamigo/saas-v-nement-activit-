import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { readFile } from "fs/promises"
import path from "path"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 })
  }

  const { id } = await params

  const attachment = await prisma.verificationAttachment.findUnique({
    where: { id },
  })

  if (!attachment) {
    return NextResponse.json({ error: "Fichier non trouve" }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), attachment.storagePath)
    const fileBuffer = await readFile(filePath)

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
        "Content-Length": String(attachment.fileSize),
      },
    })
  } catch {
    return NextResponse.json({ error: "Fichier introuvable sur le serveur" }, { status: 404 })
  }
}
