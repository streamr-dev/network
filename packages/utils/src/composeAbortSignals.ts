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
export function composeAbortSignals(...signals: AbortSignal[]): ComposedAbortSignal {
    if (signals.length === 0) {
        throw new Error('must provide at least one AbortSignal')
    }

    const preAbortedSignal = signals.find((s) => s.aborted)
    if (preAbortedSignal !== undefined) {
        return Object.assign(preAbortedSignal, { destroy: () => {} })
    }

    const abortController = new AbortController()
    const destroy = () => {
        for (const signal of signals) {
            signal.removeEventListener('abort', abort)
        }
        signals = [] // allow gc
    }
    const abort = () => {
        destroy()
        abortController.abort()
    }
    for (const signal of signals) {
        signal.addEventListener('abort', abort)
    }
    return Object.assign(abortController.signal, { destroy })
}
