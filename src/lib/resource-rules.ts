/**
 * Helper to compute the effective rules for a resource,
 * falling back to global settings defaults when no override is set.
 */

interface ResourceOverrides {
  useCustomRules: boolean
  minPartySizeOverride: number | null
  maxPartySizeOverride: number | null
  slotDurationMinutesOverride: number | null
  bookingWindowDaysOverride: number | null
}

interface SettingsDefaults {
  minPartySize: number
  maxPartySize: number
  slotDurationMinutes: number
  bookingWindowDays: number
}

export interface EffectiveRules {
  minPartySize: number
  maxPartySize: number
  slotDurationMinutes: number
  bookingWindowDays: number
}

export function getEffectiveRules(
  resource: ResourceOverrides | null | undefined,
  settings: SettingsDefaults
): EffectiveRules {
  if (!resource || !resource.useCustomRules) {
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: settings.maxPartySize,
      slotDurationMinutes: settings.slotDurationMinutes,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }

  return {
    minPartySize: resource.minPartySizeOverride ?? settings.minPartySize,
    maxPartySize: resource.maxPartySizeOverride ?? settings.maxPartySize,
    slotDurationMinutes: resource.slotDurationMinutesOverride ?? settings.slotDurationMinutes,
    bookingWindowDays: resource.bookingWindowDaysOverride ?? settings.bookingWindowDays,
  }
}
