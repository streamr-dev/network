import { asAbortable } from './asAbortable'
import { wait } from './wait'
import { compact } from 'lodash'
import { composeAbortSignals } from './composeAbortSignals'

/**
 * Wait for a condition to become true by re-evaluating `conditionFn` every `retryInterval` milliseconds.
 *
 * @param conditionFn condition to be evaluated; should return boolean or Promise<boolean> and have
 * no side effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @param userAbortSignal pass an abort signal to cancel waiting prematurely
 * @param onTimeoutContext evaluated only on timeout. Used to associate human-friendly textual context to error.
 * @returns {Promise<void>} resolves immediately if
 * conditionFn evaluates to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
export const waitForCondition = async (
    conditionFn: () => (boolean | Promise<boolean>),
    timeout = 5000,
    retryInterval = 100,
    userAbortSignal?: AbortSignal,
    onTimeoutContext?: () => string
): Promise<void> => {
    const timeoutAbortSignal: AbortSignal = (AbortSignal as any).timeout(timeout)
    const abortSignal = composeAbortSignals(...compact([timeoutAbortSignal, userAbortSignal]))
    try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const result = await asAbortable(Promise.resolve(conditionFn()), abortSignal)
            if (result) {
                return
            }
            await wait(Math.max(retryInterval, 0), abortSignal)
        }
    } catch (e) {
        if (e.code === 'AbortError') {
            let msg = `waitForCondition: timed out before "${conditionFn.toString()}" became true`
            if (onTimeoutContext) {
                msg += `\n${onTimeoutContext()}`
            }
            throw new Error(msg)
        }
        throw e
    }
}
