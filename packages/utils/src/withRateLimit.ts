/**
 * Wraps a rate limiter around a function that ensures the function is invoked max once per `intervalInMs`.
 */
export function withRateLimit(fn: () => Promise<void>, intervalInMs: number): () => Promise<void> {
    let lastInvocationTimestamp = 0
    return async () => {
        const now = Date.now()
        if (now - lastInvocationTimestamp >= intervalInMs) {
            lastInvocationTimestamp = now
            await fn()
        }
    }
}
