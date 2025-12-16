/**
 * Browser-safe environment object.
 *
 * `process.env` is NOT available in browsers unless explicitly polyfilled
 * by the bundler or runtime. This guard prevents runtime errors and falls
 * back to an empty object when no polyfill exists.
 */
const defaultEnv: Record<string, string | undefined> =
    typeof process !== 'undefined' && process?.env ? process.env : {}

/**
 * Application environment values.
 *
 * Values here are browser-safe defaults and override any polyfilled
 * `process.env` values if present.
 */
export const env = Object.assign(defaultEnv, {
    DISABLE_PRETTY_LOG: 'true',
})
