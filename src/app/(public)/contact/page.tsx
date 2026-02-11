import { LegalPageContent } from "@/components/legal/LegalPageContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact - Wadelo",
  description: "Contactez l'equipe Wadelo",
}

export default function ContactPage() {
  return <LegalPageContent slug="contact" />
}
