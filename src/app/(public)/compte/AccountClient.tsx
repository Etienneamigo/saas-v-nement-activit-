"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { logoutAction } from "@/app/actions/auth"
import {
  LogOut,
  Heart,
  Building2,
  Settings,
  CreditCard,
  Shield,
  User,
  FileText,
  ShieldCheck,
  Cookie,
  ScrollText,
  Receipt,
  Mail,
} from "lucide-react"

interface AccountClientProps {
  user: {
    name: string | null
    email: string
    role: string
  }
}

export function AccountClient({ user }: AccountClientProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-10">
      {/* User info */}
      <div className="text-center mb-8">
        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <User className="h-7 w-7 text-gray-400" />
        </div>
        {user.name && (
          <p className="font-semibold text-gray-900 text-lg">{user.name}</p>
        )}
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>

      {/* Role-specific links */}
      <div className="space-y-1 mb-8">
        {user.role === "USER" && (
          <Link
            href="/favoris"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Heart className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">Mes favoris</span>
          </Link>
        )}

        {user.role === "ESTABLISHMENT" && (
          <>
            <Link
              href="/etablissement/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            >
              <Building2 className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium">Mon établissement</span>
            </Link>
            <Link
              href="/etablissement/parametres"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            >
              <Settings className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium">Paramètres</span>
            </Link>
            <Link
              href="/etablissement/abonnement"
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            >
              <CreditCard className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium">Abonnement</span>
            </Link>
          </>
        )}

        {user.role === "ADMIN" && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Shield className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">Administration</span>
          </Link>
        )}
      </div>

      {/* Legal pages */}
      <div className="mb-8">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-4 mb-2">
          Informations legales
        </p>
        <div className="space-y-1">
          <Link
            href="/mentions-legales"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <FileText className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">Mentions legales</span>
          </Link>
          <Link
            href="/politique-confidentialite"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <ShieldCheck className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">Politique de confidentialite</span>
          </Link>
          <Link
            href="/politique-cookies"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Cookie className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">Politique cookies</span>
          </Link>
          <Link
            href="/cgu"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <ScrollText className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">CGU</span>
          </Link>
          <Link
            href="/cgv"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Receipt className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">CGV</span>
          </Link>
          <Link
            href="/contact"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Mail className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium">Contact</span>
          </Link>
        </div>
      </div>

      {/* Logout */}
      <form action={logoutAction}>
        <Button
          type="submit"
          variant="outline"
          className="w-full border-gray-200 text-gray-700"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </form>
    </div>
  )
}
