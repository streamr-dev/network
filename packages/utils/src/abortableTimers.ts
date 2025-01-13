/**
 * setTimeout with AbortSignal support. Aborting will simply clear
 * the timeout silently.
 */
export const setAbortableTimeout = (cb: () => void, ms: number, abortSignal: AbortSignal): void => {
    if (abortSignal.aborted) {
        return
    }
    const abortListener = () => {
        clearTimeout(timeoutRef)
    }
    abortSignal.addEventListener('abort', abortListener, { once: true })
    const timeoutRef = setTimeout(() => {
        abortSignal.removeEventListener('abort', abortListener)
        cb()
    }, ms)
}

/**
 * setInterval with AbortSignal support. Aborting will simply clear
 * the interval silently.
 */
export const setAbortableInterval = (cb: () => void, ms: number, abortSignal: AbortSignal): void => {
    if (abortSignal.aborted) {
        return
    }
    const abortListener = () => {
        clearInterval(timeoutRef)
    }
    abortSignal.addEventListener('abort', abortListener, { once: true })
    const timeoutRef = setInterval(() => {
        cb()
    }, ms)
}
