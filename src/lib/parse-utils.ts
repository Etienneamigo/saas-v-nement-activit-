/**
 * Safe parsing utilities for form inputs.
 * Prevents NaN from propagating through number fields.
 */

/** Safe parseInt: returns the parsed int or undefined if NaN */
export function safeParseInt(value: string): number | undefined {
  if (!value || value.trim() === "") return undefined
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}
