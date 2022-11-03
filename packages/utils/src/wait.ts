import { asAbortable } from './asAbortable'

/**
 * Wait for a specific time
 * @param ms time to wait for in milliseconds
 * @param abortSignal to control abortion of any wait
 * @returns {Promise<void>} resolves when time has passed
 */
export function wait(ms: number, abortSignal?: AbortSignal): Promise<void> {
    let timeoutRef: NodeJS.Timeout
    return asAbortable(
        new Promise<void>((resolve) => {
            timeoutRef = setTimeout(resolve, ms)
        }),
        abortSignal
    ).finally(() => {
        clearTimeout(timeoutRef)
    })
}
