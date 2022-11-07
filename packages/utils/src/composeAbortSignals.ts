/**
 * Compose a single AbortSignal from multiple AbortSignals with "OR" logic.
 */
export function composeAbortSignals(...signals: AbortSignal[]): AbortSignal {
    if (signals.length === 0) {
        throw new Error('must provide at least one AbortSignal')
    }

    const preAbortedSignal = signals.find((s) => s.aborted)
    if (preAbortedSignal !== undefined) {
        return preAbortedSignal
    }

    const abortController = new AbortController()
    const abort = () => {
        for (const signal of signals) {
            signal.removeEventListener('abort', abort)
        }
        signals = [] // allow gc
        abortController.abort()
    }
    for (const signal of signals) {
        signal.addEventListener('abort', abort)
    }
    return abortController.signal
}
