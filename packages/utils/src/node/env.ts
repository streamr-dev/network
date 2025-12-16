/**
 * Node.js environment object.
 *
 * Directly exposes `process.env`.
 */
export const env: Record<string, string | undefined> = process.env
