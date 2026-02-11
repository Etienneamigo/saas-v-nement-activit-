export const dynamic = "force-dynamic"

import { LegalPageContent } from "@/components/legal/LegalPageContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Politique cookies - Wadelo",
  description: "Politique de cookies de la plateforme Wadelo",
}

export default function PolitiqueCookiesPage() {
  return <LegalPageContent slug="politique-cookies" />
}
