import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { FileText, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"

export default async function AdminPagesLegalesPage() {
  const pages = await prisma.staticPage.findMany({
    orderBy: { title: "asc" },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Pages legales</h1>
        <p className="text-muted-foreground">
          Gerez le contenu des pages legales et informatives du site
        </p>
      </div>

      <div className="grid gap-4">
        {pages.map((page) => {
          const hasContent = page.content && page.content.trim().length > 0
          return (
            <Card key={page.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{page.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      /{page.slug}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      hasContent
                        ? "bg-green-50 text-green-700"
                        : "bg-orange-50 text-orange-700"
                    }`}
                  >
                    {hasContent ? "Publie" : "Vide"}
                  </span>
                  <Link href={`/admin/pages-legales/${page.slug}`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="h-4 w-4 mr-1" />
                      Modifier
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              {hasContent && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {page.content.substring(0, 200)}
                    {page.content.length > 200 ? "..." : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Derniere modification :{" "}
                    {new Date(page.updatedAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </CardContent>
              )}
            </Card>
          )
        })}

        {pages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Aucune page legale trouvee.</p>
            <p className="text-sm mt-1">
              Executez la migration pour creer les pages par defaut.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
