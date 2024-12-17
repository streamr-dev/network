export type ComposedAbortSignal = AbortSignal & { destroy: () => void }

/**
 * Compose a single AbortSignal from multiple AbortSignals with "OR" logic.
 *
 * WARNING: be aware of a potential memory leak that can occur if the composed
 * AbortSignal is never destroyed. This can happen if an instance of AbortSignal
 * is composed over and over with this utility but the composed AbortSignal (or
 * the other passed AbortSignal(s)) never abort. In this situation the
 * aforementioned instance of AbortSignal will have more and more listeners added
 * but never cleaned.
 */
export function composeAbortSignals(
    ...signals: (AbortSignal | undefined | null)[]
): ComposedAbortSignal {
    const controller = new AbortController()

    function destroy() {
        for (const signal of signals) {
            signal?.removeEventListener('abort', onAbort)
        }
    }

    let aborted = false

    function onAbort() {
        if (aborted) {
            return
        }

        aborted = true

        controller.abort()

        destroy()
    }

    for (const signal of signals) {
        if (!signal) {
            continue
        }

        if (signal.aborted) {
            onAbort()

            break
        }

        signal.addEventListener('abort', onAbort, { once: true })
    }

    return Object.assign(controller.signal, { destroy })
}
