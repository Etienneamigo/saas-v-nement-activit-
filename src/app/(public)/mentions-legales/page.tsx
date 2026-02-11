import { LegalPageContent } from "@/components/legal/LegalPageContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mentions legales - Wadelo",
  description: "Mentions legales de la plateforme Wadelo",
}

export default function MentionsLegalesPage() {
  return <LegalPageContent slug="mentions-legales" />
}
