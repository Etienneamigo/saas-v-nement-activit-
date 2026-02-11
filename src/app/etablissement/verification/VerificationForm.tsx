"use client"

import { useState, useRef } from "react"
import { submitVerificationRequest } from "@/app/actions/verification"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, X, FileText, Send, Info } from "lucide-react"
import { useRouter } from "next/navigation"

interface UploadedFile {
  fileName: string
  storagePath: string
  fileSize: number
  mimeType: string
}

export function VerificationForm() {
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return

    const newFiles = Array.from(e.target.files)

    // Validate each file
    for (const file of newFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        setError(`Fichier "${file.name}" : format non autorise. Utilisez PDF, JPG ou PNG.`)
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`Fichier "${file.name}" : trop volumineux (max 10 Mo)`)
        return
      }
    }

    setError(null)
    setFiles((prev) => [...prev, ...newFiles])
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (files.length === 0) {
      setError("Veuillez joindre au moins un document (KBIS, etc.)")
      return
    }

    setError(null)
    setUploading(true)

    // Upload files one by one
    const uploaded: UploadedFile[] = []
    for (const file of files) {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/verification-upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Erreur lors de l'upload d'un fichier")
        setUploading(false)
        return
      }

      const data = await res.json()
      uploaded.push({
        fileName: data.fileName,
        storagePath: data.storagePath,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      })
    }

    setUploadedFiles(uploaded)
    setUploading(false)
    setSubmitting(true)

    // Submit verification request
    const result = await submitVerificationRequest({
      message: message || undefined,
      attachments: uploaded,
    })

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      router.refresh()
    }
  }

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6 text-center">
          <Send className="h-10 w-10 text-green-600 mx-auto mb-3" />
          <h3 className="font-semibold text-green-800 text-lg">Demande envoyee</h3>
          <p className="text-sm text-green-600 mt-1">
            Votre demande de verification a ete transmise. Vous serez notifie du resultat.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demander la verification</CardTitle>
        <CardDescription>
          Soumettez vos documents officiels (KBIS, piece d&apos;identite du gerant, etc.)
          pour faire verifier votre etablissement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Les documents sont transmis de maniere securisee et ne sont accessibles
            que par l&apos;equipe Wadelo. Formats acceptes : PDF, JPG, PNG (max 10 Mo par fichier).
          </AlertDescription>
        </Alert>

        {/* Message */}
        <div className="space-y-2">
          <Label htmlFor="message">Message (optionnel)</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Informations complementaires..."
            className="min-h-[80px]"
          />
        </div>

        {/* File upload */}
        <div className="space-y-2">
          <Label>Documents</Label>
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              Cliquez pour ajouter des fichiers
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, JPG, PNG — max 10 Mo par fichier
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-gray-400">
                    ({(file.size / 1024).toFixed(0)} Ko)
                  </span>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={uploading || submitting || files.length === 0}
          className="w-full"
        >
          <Send className="h-4 w-4 mr-2" />
          {uploading
            ? "Upload des fichiers..."
            : submitting
            ? "Envoi de la demande..."
            : "Envoyer la demande de verification"}
        </Button>
      </CardContent>
    </Card>
  )
}
