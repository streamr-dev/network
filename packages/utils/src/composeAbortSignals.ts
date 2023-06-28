export type ComposedAbortSignal = AbortSignal & { destroy: () => void } 

/**
 * Compose a single AbortSignal from multiple AbortSignals with "OR" logic.
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
