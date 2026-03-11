import { Suspense } from "react"
import ResetPasswordClient from "./ResetPasswordClient"

// Force dynamic rendering — skip SSG prerender
export const dynamic = "force-dynamic"

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
          <div className="h-10 bg-gray-200 rounded w-full mt-8" />
          <div className="h-10 bg-gray-200 rounded w-full" />
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordClient />
    </Suspense>
  )
}
