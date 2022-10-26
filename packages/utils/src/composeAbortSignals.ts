function containsPreAbortedSignal(signals: Iterable<AbortSignal>): boolean {
    for (const signal of signals) {
        if (signal.aborted) {
            return true
        }
    }
    return false
}

/**
 * Compose a single AbortSignal from multiple AbortSignals with "OR" logic.
 */
export function composeAbortSignals(...signals: AbortSignal[]): AbortSignal {
    return new ComposeAbortSignals(signals)
}

class ComposeAbortSignals extends EventTarget implements AbortSignal {
    aborted: boolean
    onabort?: (event: Event) => void
    private signals?: AbortSignal[]

    constructor(signals: Iterable<AbortSignal>) {
        super()
        this.aborted = containsPreAbortedSignal(signals)
        if (!this.aborted) {
            this.signals = [...signals]
            for (const signal of this.signals) {
                signal.addEventListener('abort', this.abort)
            }
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
