import { AbortError } from './asAbortable'
import { noop } from 'lodash'

// TODO remove the type casting when type definition for abortController has been updated to include addEventListener
/**
 * A helper for attaching a listener to the abort event of an `AbortSignal`.
 * Handles the special case in which the provided signal has already been
 * "pre"-aborted.
 *
 * Returns an object with method `clear`, used to clear the listener from the
 * `AbortSignal`. This should be invoked when
 *      (a) the signal is a shared, long-lasting object, and
 *      (b) the listener is no longer required, and
 *      (c) the signal has not been aborted.
 */
export function listenOnceForAbort(
    abortSignal: AbortSignal,
    listener: () => void,
    onPreAbortedSignal: 'throw' | 'triggerListener' = 'triggerListener',
): { clear: () => void } | never {
    if (!abortSignal.aborted) {
        (abortSignal as any).addEventListener('abort', listener, { once: true })
        return {
            clear: () => (abortSignal as any).removeEventListener('abort', listener)
        }
    } else if (onPreAbortedSignal === 'triggerListener') {
        listener()
        return {
            clear: noop
        }
    } else {
        throw new AbortError()
    }
}
