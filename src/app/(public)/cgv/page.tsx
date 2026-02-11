import { LegalPageContent } from "@/components/legal/LegalPageContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Conditions generales de vente - Wadelo",
  description: "Conditions generales de vente de la plateforme Wadelo",
}

export default function CGVPage() {
  return <LegalPageContent slug="cgv" />
}
