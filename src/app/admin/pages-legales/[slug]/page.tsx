import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { EditPageForm } from "./EditPageForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface EditPageProps {
  params: Promise<{ slug: string }>
}

export default async function EditStaticPage({ params }: EditPageProps) {
  const { slug } = await params

  const page = await prisma.staticPage.findUnique({
    where: { slug },
  })

  if (!page) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/pages-legales"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux pages legales
        </Link>
        <h1 className="text-3xl font-bold">Modifier : {page.title}</h1>
        <p className="text-muted-foreground">
          Route publique : /{page.slug}
        </p>
      </div>

      <EditPageForm
        slug={page.slug}
        initialTitle={page.title}
        initialContent={page.content}
      />
    </div>
  )
}
