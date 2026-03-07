import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireOwner, isErrorResponse } from "../../../../_helpers/auth"
import { enforceApiRateLimit } from "../../../../../_helpers/rl"
import { z } from "zod"
import { Prisma } from "@prisma/client"

const timeRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm requis"),
}).refine((r) => r.start !== r.end, {
  message: "L'heure de début et de fin ne peuvent pas être identiques (plage invalide)",
})

const weeklyScheduleSchema = z.record(
  z.string(),
  z.array(timeRangeSchema)
)

const customFieldDefSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, "Label requis"),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "SELECT", "PHONE", "EMAIL", "CHECKBOX"]),
  required: z.boolean().default(false),
  optionsJson: z.array(z.string()).optional(),
  order: z.number().int().default(0),
})

const reservationSettingsSchema = z.object({
  enabled: z.boolean(),
  showExternalLinkAlso: z.boolean().default(false),
  timezone: z.string().default("Europe/Paris"),
  slotDurationMinutes: z.number().int().min(15).max(480),
  capacityPerSlot: z.number().int().min(1).max(10000),
  minPartySize: z.number().int().min(1),
  maxPartySize: z.number().int().min(1),
  minNoticeMinutes: z.number().int().min(0),
  bookingWindowDays: z.number().int().min(1).max(365),
  cancellationEnabled: z.boolean().default(true),
  cancellationDeadlineHours: z.number().int().min(0),
  confirmationMessage: z.string().optional(),
  cancellationPolicyText: z.string().optional(),
  resourceSelectionMode: z.enum(["HIDDEN", "PICK_RESOURCE_FIRST", "PICK_TIME_FIRST"]).default("HIDDEN"),
  weeklySchedule: weeklyScheduleSchema.default({}),
  customFieldDefs: z.array(customFieldDefSchema).default([]),
})

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  const settings = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
    include: {
      weeklySchedule: { orderBy: { dayOfWeek: "asc" } },
      customFieldDefs: { orderBy: { order: "asc" } },
    },
  })

  const overrides = await prisma.reservationOverride.findMany({
    where: { establishmentId },
    orderBy: { date: "asc" },
  })

  return NextResponse.json({ settings, overrides })
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await enforceApiRateLimit(request, "api")
  if (limited) return limited

  const { id: establishmentId } = await ctx.params
  const ownerOrErr = await requireOwner(request, establishmentId)
  if (isErrorResponse(ownerOrErr)) return ownerOrErr

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = reservationSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const { weeklySchedule, customFieldDefs, ...settingsData } = parsed.data

  try {
  await prisma.$transaction(async (tx) => {
    const settings = await tx.reservationSettings.upsert({
      where: { establishmentId },
      create: { establishmentId, ...settingsData },
      update: settingsData,
    })

    // Sync weekly schedule
    await tx.weeklySchedule.deleteMany({ where: { settingsId: settings.id } })
    const scheduleEntries = Object.entries(weeklySchedule)
      .filter(([, ranges]) => ranges.length > 0)
      .map(([day, ranges]) => ({
        settingsId: settings.id,
        dayOfWeek: parseInt(day),
        openRanges: ranges,
      }))
    if (scheduleEntries.length > 0) {
      await tx.weeklySchedule.createMany({ data: scheduleEntries })
    }

    // Sync custom field defs
    const existingIds = customFieldDefs.filter((f) => f.id).map((f) => f.id as string)
    await tx.reservationCustomFieldDef.deleteMany({
      where: { settingsId: settings.id, id: { notIn: existingIds } },
    })
    for (const field of customFieldDefs) {
      const optionsJson = field.optionsJson?.length
        ? (field.optionsJson as Prisma.InputJsonValue)
        : Prisma.JsonNull
      const fieldData = {
        settingsId: settings.id,
        label: field.label,
        type: field.type,
        required: field.required,
        optionsJson,
        order: field.order,
      }
      if (field.id) {
        // SECURITY: enforce ownership — only update if field belongs to THIS settings
        const updated = await tx.reservationCustomFieldDef.updateMany({
          where: { id: field.id, settingsId: settings.id },
          data: fieldData,
        })
        if (updated.count === 0) {
          throw new Error(`IDOR_BLOCKED:${field.id}`)
        }
      } else {
        await tx.reservationCustomFieldDef.create({ data: fieldData })
      }
    }
  })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("IDOR_BLOCKED:")) {
      return NextResponse.json(
        { error: "Custom field not found or access denied" },
        { status: 403 }
      )
    }
    throw err
  }

  // Return fresh settings
  const updated = await prisma.reservationSettings.findUnique({
    where: { establishmentId },
    include: {
      weeklySchedule: { orderBy: { dayOfWeek: "asc" } },
      customFieldDefs: { orderBy: { order: "asc" } },
    },
  })

  return NextResponse.json({ settings: updated })
}
