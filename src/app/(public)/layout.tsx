import { SessionProvider } from "@/components/providers/SessionProvider"
import { GeolocationProvider } from "@/components/providers/GeolocationProvider"
import { Header } from "@/components/layout/Header"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import Link from "next/link"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <GeolocationProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 pb-mobile-nav">
            {children}
          </main>
          <footer className="border-t py-8 bg-gray-50 hidden md:block">
            <div className="container mx-auto px-4">
              <div className="flex flex-wrap justify-center gap-4 mb-4 text-xs text-muted-foreground">
                <Link href="/mentions-legales" className="hover:text-gray-900 transition-colors">
                  Mentions legales
                </Link>
                <Link href="/politique-confidentialite" className="hover:text-gray-900 transition-colors">
                  Confidentialite
                </Link>
                <Link href="/politique-cookies" className="hover:text-gray-900 transition-colors">
                  Cookies
                </Link>
                <Link href="/cgu" className="hover:text-gray-900 transition-colors">
                  CGU
                </Link>
                <Link href="/cgv" className="hover:text-gray-900 transition-colors">
                  CGV
                </Link>
                <Link href="/contact" className="hover:text-gray-900 transition-colors">
                  Contact
                </Link>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Activités. Tous droits réservés.
              </p>
            </div>
          </footer>
          <MobileBottomNav />
        </div>
      </GeolocationProvider>
    </SessionProvider>
  )
}
