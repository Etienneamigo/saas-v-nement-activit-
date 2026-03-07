import { z } from "zod"

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
})

export const registerUserSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").optional(),
})

export const registerEstablishmentSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  establishmentName: z.string().min(2, "Le nom de l'établissement doit contenir au moins 2 caractères"),
  phone: z.string().optional(),
  website: z.string().url("URL invalide").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().default("France"),
  promoCode: z.string().optional(), // Code promo optionnel à l'inscription
})

// Activity schemas - type is now a free-form string (validated against DB)
export const activityTypeSchema = z.string().min(1, "Le type d'activité est requis")

export const activityStatusEnum = z.enum(["DRAFT", "PUBLISHED"])

export const createActivitySchema = z.object({
  type: activityTypeSchema,
  title: z.string().min(3, "Le titre doit contenir au moins 3 caractères"),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères"),
  address: z.string().min(5, "L'adresse doit contenir au moins 5 caractères"),
  city: z.string().min(2, "La ville doit contenir au moins 2 caractères"),
  zipCode: z.string().min(4, "Code postal invalide"),
  country: z.string().default("France"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  minPeople: z.number().int().positive().optional().nullable(),
  maxPeople: z.number().int().positive().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  priceFrom: z.number().positive().optional().nullable(),
  scheduleText: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  zone1Tags: z.array(z.string()).optional().default([]),
  zone2Tags: z.array(z.string()).optional().default([]),
  zone3Tags: z.array(z.string()).optional().default([]),
  status: activityStatusEnum.default("DRAFT"),
})

export const updateActivitySchema = createActivitySchema.partial()

// Search schemas
export const searchSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  radius: z.number().positive().default(10), // km
  type: z.string().optional(),
  city: z.string().optional(),
  minPeople: z.number().int().positive().optional(),
  maxPeople: z.number().int().positive().optional(),
  priceMax: z.number().positive().optional(),
  sortBy: z.enum(["distance", "popularity"]).default("distance"),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(20),
})

// Promo code schemas
export const createPromoCodeSchema = z.object({
  code: z.string().min(3, "Le code doit contenir au moins 3 caractères").max(50),
  description: z.string().optional(),
  extraTrialDays: z.number().int().min(0).default(0),
  maxRedemptions: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
})

export const updatePromoCodeSchema = createPromoCodeSchema.partial()

// Activity type config schemas
export const createActivityTypeConfigSchema = z.object({
  slug: z.string().min(2, "Le slug doit contenir au moins 2 caractères").max(50)
    .regex(/^[A-Z0-9_]+$/, "Le slug doit contenir uniquement des majuscules, chiffres et underscores"),
  label: z.string().min(2, "Le label doit contenir au moins 2 caractères").max(100),
  emoji: z.string().min(1, "L'emoji est requis").max(10),
  iconUrl: z.string().min(1, "URL d'icône requise").optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})

export const updateActivityTypeConfigSchema = createActivityTypeConfigSchema.partial()

// Date range validation for API query params
export function validateDateRange(
  dateFrom: string | undefined | null,
  dateTo: string | undefined | null
): { error: string } | { from?: Date; to?: Date } {
  let from: Date | undefined
  let to: Date | undefined

  if (dateFrom) {
    from = new Date(dateFrom)
    if (isNaN(from.getTime())) {
      return { error: "dateFrom invalide — format ISO 8601 ou YYYY-MM-DD attendu" }
    }
  }
  if (dateTo) {
    to = new Date(dateTo)
    if (isNaN(to.getTime())) {
      return { error: "dateTo invalide — format ISO 8601 ou YYYY-MM-DD attendu" }
    }
  }
  if (from && to && from > to) {
    return { error: "dateFrom doit être antérieure ou égale à dateTo" }
  }

  return { from, to }
}

// Types
export type LoginInput = z.infer<typeof loginSchema>
export type RegisterUserInput = z.infer<typeof registerUserSchema>
export type RegisterEstablishmentInput = z.infer<typeof registerEstablishmentSchema>
export type CreateActivityInput = z.infer<typeof createActivitySchema>
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>
export type SearchInput = z.infer<typeof searchSchema>
export type ActivityType = string
export type ActivityStatus = z.infer<typeof activityStatusEnum>
export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>
export type CreateActivityTypeConfigInput = z.infer<typeof createActivityTypeConfigSchema>
export type UpdateActivityTypeConfigInput = z.infer<typeof updateActivityTypeConfigSchema>
