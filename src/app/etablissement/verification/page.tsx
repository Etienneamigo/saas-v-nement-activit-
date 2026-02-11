import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { VerificationForm } from "./VerificationForm"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Clock, XCircle, FileText } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Verification - Wadelo",
}

export default async function VerificationPage() {
  const session = await auth()
  if (!session?.user?.establishmentId) return null

  const establishment = await prisma.establishment.findUnique({
    where: { id: session.user.establishmentId },
    select: { verifiedAt: true, name: true },
  })

  const requests = await prisma.verificationRequest.findMany({
    where: { establishmentId: session.user.establishmentId },
    orderBy: { createdAt: "desc" },
    include: { attachments: true },
  })

  const isVerified = !!establishment?.verifiedAt
  const hasPending = requests.some((r) => r.status === "PENDING")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Verification de l&apos;etablissement</h1>
        <p className="text-muted-foreground">
          Faites verifier votre etablissement pour obtenir le badge de confiance
        </p>
      </div>

      {isVerified && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-blue-600" />
            <div>
              <p className="font-medium text-blue-800">Etablissement verifie</p>
              <p className="text-sm text-blue-600">
                Votre etablissement a ete verifie le{" "}
                {new Date(establishment!.verifiedAt!).toLocaleDateString("fr-FR")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isVerified && !hasPending && (
        <VerificationForm />
      )}

      {hasPending && !isVerified && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-6 w-6 text-orange-600" />
            <div>
              <p className="font-medium text-orange-800">Demande en attente</p>
              <p className="text-sm text-orange-600">
                Votre demande de verification est en cours de traitement
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {requests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Historique des demandes</h2>
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Demande du {new Date(req.createdAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </CardTitle>
                  <Badge
                    className={
                      req.status === "APPROVED"
                        ? "bg-green-500"
                        : req.status === "REJECTED"
                        ? "bg-red-500"
                        : "bg-orange-500"
                    }
                  >
                    {req.status === "APPROVED"
                      ? "Approuvee"
                      : req.status === "REJECTED"
                      ? "Refusee"
                      : "En attente"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {req.message && (
                    <p className="text-sm text-muted-foreground mb-2">{req.message}</p>
                  )}
                  {req.adminNote && req.status === "REJECTED" && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-2">
                      <strong>Motif du refus :</strong> {req.adminNote}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    {req.attachments.length} piece(s) jointe(s)
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
