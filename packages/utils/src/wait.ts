import { setTimeout } from 'timers/promises'
import { AbortError } from './AbortError'

/**
 * Wait for a specific time
 * @param ms time to wait for in milliseconds
 * @param abortController to control cancellation of any wait
 * @returns {Promise<void>} resolves when time has passed
 */
export const wait = (ms: number, abortController?: AbortController): Promise<void> => setTimeout(
    ms,
    undefined,
    { signal: abortController?.signal }
).catch((e) => {
    if (e?.code === 'ABORT_ERR') {
        throw new AbortError()
    }
    throw e
})
