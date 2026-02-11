"use client"

import { useState } from "react"
import { updateStaticPage } from "@/app/actions/static-pages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Save, Eye, EyeOff, Info } from "lucide-react"

interface EditPageFormProps {
  slug: string
  initialTitle: string
  initialContent: string
}

// Simple markdown-to-HTML renderer (same as LegalPageContent)
function renderMarkdown(content: string): string {
  let html = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  html = html
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline hover:text-blue-800" rel="noopener noreferrer">$1</a>')
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200" />')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br />")

  html = html.replace(/((<li>.*?<\/li>\s*)+)/g, '<ul class="list-disc pl-6 space-y-1">$1</ul>')
  html = `<p>${html}</p>`
  html = html.replace(/<p><\/p>/g, "")
  html = html.replace(/<p>(<h[1-3]>)/g, "$1")
  html = html.replace(/(<\/h[1-3]>)<\/p>/g, "$1")
  html = html.replace(/<p>(<hr[^>]*\/>)/g, "$1")
  html = html.replace(/(<hr[^>]*\/>)<\/p>/g, "$1")
  html = html.replace(/<p>(<ul)/g, "$1")
  html = html.replace(/(<\/ul>)<\/p>/g, "$1")

  return html
}

export function EditPageForm({
  slug,
  initialTitle,
  initialContent,
}: EditPageFormProps) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)

    const result = await updateStaticPage(slug, { title, content })

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }

    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Le contenu supporte le format <strong>Markdown</strong> : titres (# ## ###),
          gras (**texte**), italique (*texte*), listes (- item), liens ([texte](url)),
          separateurs (---).
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Contenu de la page</CardTitle>
          <CardDescription>
            Modifiez le titre et le contenu de la page. Le contenu sera affiche
            sur la page publique /{slug}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de la page"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Contenu (Markdown)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Editeur
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    Apercu
                  </>
                )}
              </Button>
            </div>

            {showPreview ? (
              <div className="min-h-[400px] border rounded-md p-4 bg-white">
                {content.trim() ? (
                  <div
                    className="prose prose-gray max-w-none [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:mb-4 [&_li]:mb-1 [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(content),
                    }}
                  />
                ) : (
                  <p className="text-muted-foreground italic">
                    Aucun contenu a afficher
                  </p>
                )}
              </div>
            ) : (
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ecrivez le contenu en Markdown..."
                className="min-h-[400px] font-mono text-sm"
              />
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              Page sauvegardee avec succes. La page publique a ete mise a jour.
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
            <a
              href={`/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-gray-900 transition-colors"
            >
              Voir la page publique &rarr;
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
