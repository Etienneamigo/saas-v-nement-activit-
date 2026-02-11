"use client"

import { useState } from "react"
import { approveVerificationRequest, rejectVerificationRequest } from "@/app/actions/verification"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function VerificationActions({ requestId }: { requestId: string }) {
  const [rejectNote, setRejectNote] = useState("")
  const [showReject, setShowReject] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleApprove() {
    setLoading(true)
    const result = await approveVerificationRequest(requestId)
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Demande approuvee - etablissement verifie")
      router.refresh()
    }
  }

  async function handleReject() {
    setLoading(true)
    const result = await rejectVerificationRequest(requestId, rejectNote || undefined)
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Demande refusee")
      router.refresh()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approuver
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowReject(!showReject)}
            disabled={loading}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Refuser
          </Button>
        </div>

        {showReject && (
          <div className="space-y-3 p-4 border border-red-200 rounded-lg bg-red-50">
            <div className="space-y-2">
              <Label htmlFor="rejectNote">Motif du refus (optionnel)</Label>
              <Textarea
                id="rejectNote"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Raison du refus..."
                className="bg-white"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={loading}
            >
              Confirmer le refus
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
