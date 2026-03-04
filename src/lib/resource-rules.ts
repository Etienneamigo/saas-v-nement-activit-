/**
 * Helper to compute the effective rules for a resource,
 * falling back to global settings defaults when no override is set.
 *
 * IMPORTANT: capacity is the single source of truth for maxPartySize.
 * When a resource has a capacity field, it is used as the effective maxPartySize.
 * The maxPartySizeOverride / maxPartySize in settings are kept for backward
 * compatibility but ignored when capacity is available on the resource.
 */

interface ResourceOverrides {
  capacity?: number
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
  capacityPerSlot?: number
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
  if (!resource) {
    // No resource → use global settings; capacityPerSlot = maxPartySize effective
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: settings.capacityPerSlot ?? settings.maxPartySize,
      slotDurationMinutes: settings.slotDurationMinutes,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }

  // Resource exists → capacity is the source of truth for maxPartySize
  const effectiveMaxPartySize = resource.capacity ?? settings.capacityPerSlot ?? settings.maxPartySize

  if (!resource.useCustomRules) {
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: effectiveMaxPartySize,
      slotDurationMinutes: settings.slotDurationMinutes,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }

  return {
    minPartySize: resource.minPartySizeOverride ?? settings.minPartySize,
    maxPartySize: effectiveMaxPartySize,
    slotDurationMinutes: resource.slotDurationMinutesOverride ?? settings.slotDurationMinutes,
    bookingWindowDays: resource.bookingWindowDaysOverride ?? settings.bookingWindowDays,
  }
}
