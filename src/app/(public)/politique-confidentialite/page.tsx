import { LegalPageContent } from "@/components/legal/LegalPageContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Politique de confidentialite - Wadelo",
  description: "Politique de confidentialite de la plateforme Wadelo",
}

export default function PolitiqueConfidentialitePage() {
  return <LegalPageContent slug="politique-confidentialite" />
}
