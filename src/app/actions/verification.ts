"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { sendEmail } from "@/lib/email"

// Helper to check admin role
async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Non autorise")
  }
  return session
}

// Helper to check establishment role
async function requireEstablishment() {
  const session = await auth()
  if (!session || session.user.role !== "ESTABLISHMENT" || !session.user.establishmentId) {
    throw new Error("Non autorise")
  }
  return session
}

// Submit a verification request (ESTABLISHMENT only)
export async function submitVerificationRequest(data: {
  message?: string
  attachments: {
    fileName: string
    storagePath: string
    fileSize: number
    mimeType: string
  }[]
}) {
  try {
    const session = await requireEstablishment()
    const establishmentId = session.user.establishmentId!

    // Check if there's already a PENDING request
    const existingPending = await prisma.verificationRequest.findFirst({
      where: { establishmentId, status: "PENDING" },
    })

    if (existingPending) {
      return { error: "Vous avez deja une demande de verification en attente" }
    }

    // Create the verification request with attachments
    const request = await prisma.verificationRequest.create({
      data: {
        establishmentId,
        message: data.message || null,
        attachments: {
          create: data.attachments.map((a) => ({
            fileName: a.fileName,
            storagePath: a.storagePath,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
          })),
        },
      },
      include: {
        establishment: {
          include: { user: { select: { email: true } } },
        },
        attachments: true,
      },
    })

    // Send notification email to admin
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"
    const adminUrl = `${baseUrl}/admin/verifications/${request.id}`

    const attachmentsList = request.attachments
      .map((a) => `- ${a.fileName} (${(a.fileSize / 1024).toFixed(0)} Ko)`)
      .join("\n")

    await sendEmail({
      to: "contact.wadelo@gmail.com",
      subject: `Nouvelle demande de verification - ${request.establishment.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">WADELO</h1>
          </div>

          <h2>Nouvelle demande de verification</h2>

          <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Etablissement :</strong> ${request.establishment.name}</p>
            <p><strong>Email :</strong> ${request.establishment.user.email}</p>
            <p><strong>ID :</strong> ${request.establishmentId}</p>
            ${request.message ? `<p><strong>Message :</strong> ${request.message}</p>` : ""}
          </div>

          <h3>Pieces jointes (${request.attachments.length})</h3>
          <pre style="background: #f9f9f9; padding: 12px; border-radius: 8px; font-size: 13px;">${attachmentsList}</pre>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${adminUrl}"
               style="display: inline-block; background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Traiter la demande
            </a>
          </div>

          <p style="color: #999; font-size: 12px;">
            Les pieces jointes sont telechargeable uniquement depuis l'interface admin.
          </p>
        </body>
        </html>
      `,
    })

    revalidatePath("/etablissement/verification")
    revalidatePath("/etablissement/dashboard")
    return { request }
  } catch (error) {
    console.error("Verification request error:", error)
    return { error: "Erreur lors de la soumission de la demande" }
  }
}

// Get verification requests for the current establishment
export async function getMyVerificationRequests() {
  try {
    const session = await requireEstablishment()

    const requests = await prisma.verificationRequest.findMany({
      where: { establishmentId: session.user.establishmentId! },
      orderBy: { createdAt: "desc" },
      include: { attachments: true },
    })

    const establishment = await prisma.establishment.findUnique({
      where: { id: session.user.establishmentId! },
      select: { verifiedAt: true },
    })

    return { requests, isVerified: !!establishment?.verifiedAt }
  } catch {
    return { error: "Erreur lors de la recuperation des demandes" }
  }
}

// Admin: get all verification requests
export async function getVerificationRequests(statusFilter?: string) {
  try {
    await requireAdmin()

    const where = statusFilter && statusFilter !== "ALL"
      ? { status: statusFilter as "PENDING" | "APPROVED" | "REJECTED" }
      : {}

    const requests = await prisma.verificationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        establishment: {
          include: {
            user: { select: { email: true } },
            activity: { select: { id: true, title: true } },
          },
        },
        attachments: true,
      },
    })

    return { requests }
  } catch {
    return { error: "Erreur lors de la recuperation des demandes" }
  }
}

// Admin: get a single verification request
export async function getVerificationRequest(id: string) {
  try {
    await requireAdmin()

    const request = await prisma.verificationRequest.findUnique({
      where: { id },
      include: {
        establishment: {
          include: {
            user: { select: { email: true, name: true } },
            activity: { select: { id: true, title: true, status: true } },
          },
        },
        attachments: true,
      },
    })

    return { request }
  } catch {
    return { error: "Erreur lors de la recuperation de la demande" }
  }
}

// Admin: approve a verification request
export async function approveVerificationRequest(id: string) {
  try {
    const session = await requireAdmin()

    const request = await prisma.verificationRequest.findUnique({
      where: { id },
    })

    if (!request) {
      return { error: "Demande non trouvee" }
    }

    // Update request status + mark establishment as verified
    await prisma.$transaction([
      prisma.verificationRequest.update({
        where: { id },
        data: { status: "APPROVED" },
      }),
      prisma.establishment.update({
        where: { id: request.establishmentId },
        data: {
          verifiedAt: new Date(),
          verifiedByAdminId: session.user.id,
        },
      }),
    ])

    revalidatePath("/admin/verifications")
    revalidatePath(`/admin/verifications/${id}`)
    revalidatePath("/admin/etablissements")
    return { success: true }
  } catch {
    return { error: "Erreur lors de l'approbation" }
  }
}

// Admin: reject a verification request
export async function rejectVerificationRequest(id: string, adminNote?: string) {
  try {
    await requireAdmin()

    const request = await prisma.verificationRequest.findUnique({
      where: { id },
    })

    if (!request) {
      return { error: "Demande non trouvee" }
    }

    await prisma.verificationRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: adminNote || null,
      },
    })

    revalidatePath("/admin/verifications")
    revalidatePath(`/admin/verifications/${id}`)
    return { success: true }
  } catch {
    return { error: "Erreur lors du refus" }
  }
}
