/*
 * Shared constants and sanitizers for the FSM editor.
 */

// Fixed radius for every state circle (long labels shrink instead)
export const STATE_RADIUS = 40

// Max name length so `name / 5 output bits` still fits the circle
export const MAX_STATE_NAME_LENGTH = 12

// Only allow safe chars (no HTML/script injection) and cap length
export function sanitizeStateName(value) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .slice(0, MAX_STATE_NAME_LENGTH)
}
