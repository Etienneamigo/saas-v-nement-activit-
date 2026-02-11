import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, Download, FileText, ExternalLink } from "lucide-react"
import { VerificationActions } from "./VerificationActions"

interface VerificationDetailProps {
  params: Promise<{ id: string }>
}

export default async function VerificationDetailPage({ params }: VerificationDetailProps) {
  const { id } = await params

  const request = await prisma.verificationRequest.findUnique({
    where: { id },
    include: {
      establishment: {
        include: {
          user: { select: { email: true, name: true } },
          activity: { select: { id: true, title: true, status: true } },
        },
      },
      attachments: true,
    },
  })

  if (!request) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/verifications"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux demandes
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Demande de verification</h1>
          <Badge
            className={
              request.status === "APPROVED"
                ? "bg-green-500"
                : request.status === "REJECTED"
                ? "bg-red-500"
                : "bg-orange-500"
            }
          >
            {request.status === "APPROVED"
              ? "Approuvee"
              : request.status === "REJECTED"
              ? "Refusee"
              : "En attente"}
          </Badge>
        </div>
      </div>

      {/* Establishment info */}
      <Card>
        <CardHeader>
          <CardTitle>Etablissement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nom</p>
              <p className="font-medium">{request.establishment.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{request.establishment.user.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de demande</p>
              <p className="font-medium">
                {new Date(request.createdAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {request.establishment.activity && (
              <div>
                <p className="text-sm text-muted-foreground">Activite</p>
                <Link
                  href={`/activite/${request.establishment.activity.id}`}
                  target="_blank"
                  className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {request.establishment.activity.title}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
          {request.message && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">Message de l&apos;etablissement</p>
              <p className="text-sm bg-gray-50 p-3 rounded-lg">{request.message}</p>
            </div>
          )}
          {request.adminNote && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">Note admin</p>
              <p className="text-sm bg-red-50 p-3 rounded-lg text-red-700">{request.adminNote}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader>
          <CardTitle>Pieces jointes ({request.attachments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {request.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">{attachment.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(attachment.fileSize / 1024).toFixed(0)} Ko — {attachment.mimeType}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/verification-download/${attachment.id}`}>
                    <Download className="h-4 w-4 mr-1" />
                    Telecharger
                  </a>
                </Button>
              </div>
            ))}
            {request.attachments.length === 0 && (
              <p className="text-muted-foreground text-sm">Aucune piece jointe</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {request.status === "PENDING" && (
        <VerificationActions requestId={request.id} />
      )}
    </div>
  )
}
