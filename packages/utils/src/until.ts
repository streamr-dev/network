import { asAbortable } from './asAbortable'
import { wait } from './wait'
import { composeAbortSignals } from './composeAbortSignals'

function throwError(userAborted: boolean, conditionFn: () => any, onTimeoutContext?: () => string): never {
    const action = userAborted ? 'aborted' : 'timed out'
    let msg = `until: ${action} before "${conditionFn.toString()}" became true`
    if (onTimeoutContext) {
        msg += `\n${onTimeoutContext()}`
    }
    throw new Error(msg)
}

/**
 * Wait for a condition to become true by re-evaluating `conditionFn` every `retryInterval` milliseconds.
 *
 * @param conditionFn condition to be evaluated; should return boolean or Promise<boolean> and have
 * no side effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @param abortSignal pass an abort signal to cancel prematurely
 * @param onTimeoutContext evaluated only on timeout. Used to associate human-friendly textual context to error.
 * @returns {Promise<void>} resolves immediately if
 * conditionFn evaluates to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
export const until = async (
    conditionFn: () => boolean | Promise<boolean>,
    timeout = 5000,
    retryInterval = 100,
    abortSignal?: AbortSignal,
    onTimeoutContext?: () => string
): Promise<void> => {
    let userAborted = abortSignal?.aborted ?? false
    if (userAborted) {
        throwError(userAborted, conditionFn, onTimeoutContext)
    }
    abortSignal?.addEventListener(
        'abort',
        () => {
            userAborted = true
        },
        { once: true }
    )
    const timeoutAbortSignal: AbortSignal = AbortSignal.timeout(timeout)
    const composedSignal = composeAbortSignals(timeoutAbortSignal, abortSignal)
    try {
        while (true) {
            const result = await asAbortable(Promise.resolve(conditionFn()), composedSignal)
            if (result) {
                return
            }
            await wait(retryInterval, composedSignal)
        }
    } catch (e) {
        if (e.code === 'AbortError') {
            throwError(userAborted, conditionFn, onTimeoutContext)
        }
        throw e
    } finally {
        composedSignal.destroy()
    }
}
