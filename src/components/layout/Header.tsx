"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { logoutAction } from "@/app/actions/auth"
import { User, LogOut, Building2, Heart, Shield, CreditCard, Settings } from "lucide-react"

export function Header() {
  const { data: session, status } = useSession()

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return "U"
  }

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        {/* Desktop: logo left */}
        <Link href="/" className="hidden md:flex items-center">
          <span className="font-bold text-xl tracking-tight">WADELO</span>
        </Link>

        {/* Mobile: logo centered — use flex trick with invisible spacers */}
        <div className="flex md:hidden items-center justify-center flex-1">
          <Link href="/">
            <span className="font-bold text-xl tracking-tight">WADELO</span>
          </Link>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center space-x-6">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Accueil
          </Link>
          <Link href="/recherche" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Rechercher
          </Link>
          <Link href="/feed" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Feed
          </Link>
          {session?.user?.role === "ESTABLISHMENT" && (
            <>
              <Link href="/etablissement/dashboard" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Mon établissement
              </Link>
              <Link href="/etablissement/reservations" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Réservations
              </Link>
              <Link href="/etablissement/abonnement" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Abonnement
              </Link>
            </>
          )}
          {session?.user?.role === "ADMIN" && (
            <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Administration
            </Link>
          )}
        </nav>

        {/* Auth / avatar — desktop only */}
        <div className="hidden md:flex items-center space-x-3">
          {status === "loading" ? (
            <div className="h-8 w-8 bg-gray-100 rounded-full animate-pulse" />
          ) : session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(session.user.name, session.user.email)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {session.user.name && (
                      <p className="font-medium text-sm">{session.user.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {session.user.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                {session.user.role === "USER" && (
                  <DropdownMenuItem asChild>
                    <Link href="/favoris" className="cursor-pointer">
                      <Heart className="mr-2 h-4 w-4" />
                      Mes favoris
                    </Link>
                  </DropdownMenuItem>
                )}
                {session.user.role === "ESTABLISHMENT" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/etablissement/dashboard" className="cursor-pointer">
                        <Building2 className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/etablissement/parametres" className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        Paramètres
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/etablissement/abonnement" className="cursor-pointer">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Abonnement
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {session.user.role === "ADMIN" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer">
                      <Shield className="mr-2 h-4 w-4" />
                      Administration
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action={logoutAction}>
                    <button type="submit" className="w-full flex items-center cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      Déconnexion
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/connexion">Connexion</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/auth/inscription">Inscription</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
