export const dynamic = "force-dynamic"

import { LegalPageContent } from "@/components/legal/LegalPageContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Conditions generales d'utilisation - Wadelo",
  description: "Conditions generales d'utilisation de la plateforme Wadelo",
}

export default function CGUPage() {
  return <LegalPageContent slug="cgu" />
}
