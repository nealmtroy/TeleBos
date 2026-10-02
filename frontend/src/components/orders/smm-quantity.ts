/**
 * Quantity handling for the SMM order modal.
 *
 * The field is edited as a free-form string so a partially typed number is not
 * rewritten mid-keystroke. The previous implementation clamped inside onChange
 * with Math.max(1, parseInt(...) || 1), which meant clearing the field snapped
 * straight back to 1, and because the input carried min={service.min} the
 * browser then rejected anything else typed into it.
 */

/** Parse user input without inventing a value. Returns null when unusable. */
export function parseQuantityInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Clamp into the service's allowed range. An unusable input falls back to the
 * minimum so the field is never left in an un-submittable state.
 */
export function clampQuantity(raw: string, min: number, max: number): number {
  const parsed = parseQuantityInput(raw);
  if (parsed === null) return min;
  return Math.min(max, Math.max(min, parsed));
}

/** True when the input cannot be submitted as-is and needs a clamp first. */
export function needsClamp(raw: string, min: number, max: number): boolean {
  const parsed = parseQuantityInput(raw);
  if (parsed === null) return true;
  return parsed < min || parsed > max;
}