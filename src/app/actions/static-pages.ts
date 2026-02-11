"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

// Helper to check admin role
async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Non autorise")
  }
  return session
}

// Get all static pages (public)
export async function getStaticPages() {
  try {
    const pages = await prisma.staticPage.findMany({
      orderBy: { title: "asc" },
    })
    return { pages }
  } catch {
    return { error: "Erreur lors de la recuperation des pages" }
  }
}

// Get a single static page by slug (public)
export async function getStaticPageBySlug(slug: string) {
  try {
    const page = await prisma.staticPage.findUnique({
      where: { slug },
    })
    return { page }
  } catch {
    return { error: "Erreur lors de la recuperation de la page" }
  }
}

// Update a static page (admin only)
export async function updateStaticPage(
  slug: string,
  data: { title?: string; content?: string }
) {
  try {
    await requireAdmin()

    const page = await prisma.staticPage.update({
      where: { slug },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
      },
    })

    // Revalidate the public page and admin page
    revalidatePath(`/${slug}`)
    revalidatePath("/admin/pages-legales")

    return { page }
  } catch {
    return { error: "Erreur lors de la mise a jour de la page" }
  }
}
