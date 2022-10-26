function findPreAbortedSignal(signals: Iterable<AbortSignal>): AbortSignal | undefined {
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
    const preAbortedSignal = findPreAbortedSignal(signals)
    if (preAbortedSignal !== undefined) {
        return preAbortedSignal
    } else {
        return new CompositeAbortSignal(signals)
    }
}

class CompositeAbortSignal extends EventTarget implements AbortSignal {
    aborted = false
    onabort?: (event: Event) => void
    private signals?: ReadonlyArray<AbortSignal>

    constructor(signals: AbortSignal[]) {
        super()
        this.signals = [...signals]
        for (const signal of this.signals) {
            signal.addEventListener('abort', this.abort)
        }
    }

    private abort = () => {
        for (const signal of this.signals!) {
            signal.removeEventListener('abort', this.abort)
        }
        delete this.signals // optimization: allow gc
        this.aborted = true
        const event = new Event('abort')
        this.dispatchEvent(event)
        this.onabort?.(event)
    }
}
