import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"

// Simple markdown-to-HTML renderer (safe - no script injection)
function renderMarkdown(content: string): string {
  let html = content
    // Escape HTML entities first to prevent XSS
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // Then apply markdown formatting
  html = html
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links (markdown style)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline hover:text-blue-800" rel="noopener noreferrer">$1</a>')
    // Unordered lists
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200" />')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, "</p><p>")
    // Single newlines
    .replace(/\n/g, "<br />")

  // Wrap list items in ul
  html = html.replace(/((<li>.*?<\/li>\s*)+)/g, '<ul class="list-disc pl-6 space-y-1">$1</ul>')

  // Wrap in paragraph
  html = `<p>${html}</p>`

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, "")
  html = html.replace(/<p>(<h[1-3]>)/g, "$1")
  html = html.replace(/(<\/h[1-3]>)<\/p>/g, "$1")
  html = html.replace(/<p>(<hr[^>]*\/>)/g, "$1")
  html = html.replace(/(<hr[^>]*\/>)<\/p>/g, "$1")
  html = html.replace(/<p>(<ul)/g, "$1")
  html = html.replace(/(<\/ul>)<\/p>/g, "$1")

  return html
}

interface LegalPageContentProps {
  slug: string
}

export async function LegalPageContent({ slug }: LegalPageContentProps) {
  const page = await prisma.staticPage.findUnique({
    where: { slug },
  })

  if (!page) {
    notFound()
  }

  const hasContent = page.content && page.content.trim().length > 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">{page.title}</h1>
      {hasContent ? (
        <div
          className="prose prose-gray max-w-none [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:mb-4 [&_li]:mb-1 [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
        />
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500">
            Cette page est en cours de redaction.
          </p>
        </div>
      )}
      {page.updatedAt && hasContent && (
        <p className="text-xs text-gray-400 mt-12">
          Derniere mise a jour : {new Date(page.updatedAt).toLocaleDateString("fr-FR")}
        </p>
      )}
    </div>
  )
}
