import { NextResponse } from "next/server"
import { requireMobileAuth, type MobileUser } from "@/lib/mobile-auth"
import { UserRole } from "@prisma/client"

/**
 * Require mobile auth + verify that user is ESTABLISHMENT owner of the given establishmentId.
 * Returns the MobileUser or a NextResponse error.
 */
export async function requireOwner(
  request: Request,
  establishmentId: string
): Promise<MobileUser | NextResponse> {
  const user = await requireMobileAuth(request)

  if (user.role !== UserRole.ESTABLISHMENT && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!user.establishmentId || user.establishmentId !== establishmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return user
}

export function isErrorResponse(result: MobileUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
