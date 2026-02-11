import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Eye, FileText, Clock, CheckCircle2, XCircle } from "lucide-react"

interface VerificationsPageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function VerificationsPage({ searchParams }: VerificationsPageProps) {
  const { status: statusFilter } = await searchParams

  const where = statusFilter && statusFilter !== "ALL"
    ? { status: statusFilter as "PENDING" | "APPROVED" | "REJECTED" }
    : {}

  const [requests, counts] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        establishment: {
          include: {
            user: { select: { email: true } },
            activity: { select: { id: true, title: true } },
          },
        },
        attachments: true,
      },
    }),
    prisma.verificationRequest.groupBy({
      by: ["status"],
      _count: true,
    }),
  ])

  const pendingCount = counts.find((c) => c.status === "PENDING")?._count || 0
  const approvedCount = counts.find((c) => c.status === "APPROVED")?._count || 0
  const rejectedCount = counts.find((c) => c.status === "REJECTED")?._count || 0
  const totalCount = pendingCount + approvedCount + rejectedCount

  function getStatusBadge(status: string) {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Approuvee</Badge>
      case "REJECTED":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Refusee</Badge>
      default:
        return <Badge className="bg-orange-500"><Clock className="h-3 w-3 mr-1" />En attente</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Demandes de verification</h1>
        <p className="text-muted-foreground">Gerez les demandes de verification des etablissements</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/verifications">
          <Button variant={!statusFilter ? "default" : "outline"} size="sm">
            Toutes ({totalCount})
          </Button>
        </Link>
        <Link href="/admin/verifications?status=PENDING">
          <Button variant={statusFilter === "PENDING" ? "default" : "outline"} size="sm">
            En attente ({pendingCount})
          </Button>
        </Link>
        <Link href="/admin/verifications?status=APPROVED">
          <Button variant={statusFilter === "APPROVED" ? "default" : "outline"} size="sm">
            Approuvees ({approvedCount})
          </Button>
        </Link>
        <Link href="/admin/verifications?status=REJECTED">
          <Button variant={statusFilter === "REJECTED" ? "default" : "outline"} size="sm">
            Refusees ({rejectedCount})
          </Button>
        </Link>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {statusFilter ? `Demandes ${statusFilter === "PENDING" ? "en attente" : statusFilter === "APPROVED" ? "approuvees" : "refusees"}` : "Toutes les demandes"}
          </CardTitle>
          <CardDescription>{requests.length} demande(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{req.establishment.name}</p>
                    {getStatusBadge(req.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{req.establishment.user.email}</p>
                  {req.establishment.activity && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Activite : {req.establishment.activity.title}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>
                      {new Date(req.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {req.attachments.length} piece(s) jointe(s)
                    </span>
                  </div>
                </div>
                <Link href={`/admin/verifications/${req.id}`}>
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-1" />
                    Voir
                  </Button>
                </Link>
              </div>
            ))}

            {requests.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Aucune demande de verification
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
