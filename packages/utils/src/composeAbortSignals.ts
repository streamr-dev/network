function findFirstPreAbortedSignal(signals: Iterable<AbortSignal>): AbortSignal | undefined {
    for (const signal of signals) {
        if (signal.aborted) {
            return signal
        }
    }
    return undefined
}

/**
 * Compose a single AbortSignal from multiple AbortSignals with "OR" logic.
 */
export function composeAbortSignals(...signals: AbortSignal[]): AbortSignal {
    if (signals.length === 0) {
        throw new Error('must provide at least one AbortSignal')
    }

    const preAbortedSignal = findFirstPreAbortedSignal(signals)
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
