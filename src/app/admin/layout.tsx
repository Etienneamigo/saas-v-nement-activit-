import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "@/components/providers/SessionProvider"
import { Header } from "@/components/layout/Header"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import Link from "next/link"
import { Users, Building2, Tag, LayoutDashboard, Settings, Shapes, FileText } from "lucide-react"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/auth/connexion")
  }

  if (session.user.role !== "ADMIN") {
    redirect("/")
  }

  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r min-h-[calc(100vh-4rem)] hidden md:block">
            <nav className="p-4 space-y-1">
              <Link
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <LayoutDashboard className="h-5 w-5" />
                Tableau de bord
              </Link>
              <Link
                href="/admin/users"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <Users className="h-5 w-5" />
                Utilisateurs
              </Link>
              <Link
                href="/admin/etablissements"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <Building2 className="h-5 w-5" />
                Etablissements
              </Link>
              <Link
                href="/admin/types-activite"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <Shapes className="h-5 w-5" />
                Types d&apos;activite
              </Link>
              <Link
                href="/admin/promo-codes"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <Tag className="h-5 w-5" />
                Codes promo
              </Link>
              <Link
                href="/admin/pages-legales"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <FileText className="h-5 w-5" />
                Pages legales
              </Link>
              <Link
                href="/admin/parametres"
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <Settings className="h-5 w-5" />
                Parametres du site
              </Link>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-4 md:p-8 pb-mobile-nav">
            {children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SessionProvider>
  )
}
