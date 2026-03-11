"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, ArrowLeft } from "lucide-react"

export default function ResetPasswordClient() {
  const searchParams = useSearchParams()
  const tokenFromUrl = searchParams.get("token")
  const emailFromUrl = searchParams.get("email")

  // If token + email in URL => show "new password" form
  // Otherwise => show "request reset" form
  const hasToken = Boolean(tokenFromUrl && emailFromUrl)

  return hasToken ? (
    <NewPasswordForm token={tokenFromUrl!} email={emailFromUrl!} />
  ) : (
    <RequestResetForm defaultEmail={emailFromUrl ?? ""} />
  )
}

function RequestResetForm({ defaultEmail }: { defaultEmail: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [email, setEmail] = useState(defaultEmail)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setSuccess(true)
      }
    } catch {
      // Still show success for anti-enumeration
      setSuccess(true)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-center">Email envoyé</CardTitle>
            <CardDescription className="text-center">
              Si cette adresse email est associée à un compte, vous recevrez un email
              avec un lien pour réinitialiser votre mot de passe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800 text-sm">
                <p className="font-medium mb-1">Pensez à vérifier vos spams</p>
                <p>Le lien est valide pendant 30 minutes.</p>
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Link href="/auth/connexion" className="w-full">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour à la connexion
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-3xl">🎯</span>
              <span className="font-bold text-2xl">Activités</span>
            </Link>
          </div>
          <CardTitle className="text-2xl text-center">Mot de passe oublié</CardTitle>
          <CardDescription className="text-center">
            Entrez votre email pour recevoir un lien de réinitialisation
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemple@email.com"
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Envoi..." : "Envoyer le lien de réinitialisation"}
            </Button>
            <div className="text-sm text-center text-gray-600">
              <Link href="/auth/connexion" className="text-primary hover:underline">
                <ArrowLeft className="inline mr-1 h-3 w-3" />
                Retour à la connexion
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, newPassword }),
      })

      const data = await res.json()

      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || "Une erreur est survenue.")
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-center">Mot de passe réinitialisé</CardTitle>
            <CardDescription className="text-center">
              Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-4">
            <Link href="/auth/connexion" className="w-full">
              <Button className="w-full">
                Se connecter
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-3xl">🎯</span>
              <span className="font-bold text-2xl">Activités</span>
            </Link>
          </div>
          <CardTitle className="text-2xl text-center">Nouveau mot de passe</CardTitle>
          <CardDescription className="text-center">
            Choisissez un nouveau mot de passe pour votre compte
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert className="bg-red-50 border-red-200">
                <AlertDescription className="text-red-800">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Minimum 8 caractères, au moins une lettre et un chiffre.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
            </Button>
            <div className="text-sm text-center text-gray-600">
              <Link href="/auth/connexion" className="text-primary hover:underline">
                <ArrowLeft className="inline mr-1 h-3 w-3" />
                Retour à la connexion
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
