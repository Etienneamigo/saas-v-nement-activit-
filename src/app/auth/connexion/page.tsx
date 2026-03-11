"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { loginAction, resendVerificationAction } from "@/app/actions/auth"
import { toast } from "sonner"
import { Mail } from "lucide-react"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [emailNotVerified, setEmailNotVerified] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setEmailNotVerified(null)
    const result = await loginAction(formData)
    setIsLoading(false)

    if (result?.error) {
      if (result.emailNotVerified && result.email) {
        setEmailNotVerified(result.email)
      } else {
        toast.error(result.error)
      }
    } else {
      router.push("/")
      router.refresh()
    }
  }

  async function handleResendVerification() {
    if (!emailNotVerified) return

    setIsResending(true)
    const result = await resendVerificationAction(emailNotVerified)
    setIsResending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Email de vérification envoyé !")
    }
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
          <CardTitle className="text-2xl text-center">Connexion</CardTitle>
          <CardDescription className="text-center">
            Connectez-vous à votre compte
          </CardDescription>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            {emailNotVerified && (
              <Alert className="bg-amber-50 border-amber-200">
                <Mail className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <p className="font-medium mb-2">Email non vérifié</p>
                  <p className="text-sm mb-3">
                    Veuillez vérifier votre email avant de vous connecter.
                    Consultez votre boîte de réception (et les spams).
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={isResending}
                  >
                    {isResending ? "Envoi..." : "Renvoyer l'email de vérification"}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="exemple@email.com"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link
                  href="/reset-password"
                  className="text-xs text-primary hover:underline"
                  tabIndex={-1}
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Connexion..." : "Se connecter"}
            </Button>
            <div className="text-sm text-center text-gray-600">
              Pas encore de compte ?{" "}
              <Link href="/auth/inscription" className="text-primary hover:underline">
                Créer un compte
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
