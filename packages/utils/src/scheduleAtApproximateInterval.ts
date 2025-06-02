import { scheduleAtInterval } from './scheduleAtInterval'
import { wait } from './wait'

/**
 * @param {number} approximateIntervalInMs - approximate time (in milliseconds) to wait after a task is completed
 * @param {number} driftMultiplier how much the wait time can vary: e.g. if the interval is 60 minutes and the drift is 0.1,
 * the delay between invocations will range from 54 to 66 minutes
 */
export const scheduleAtApproximateInterval = async (
    task: () => Promise<void>,
    approximateIntervalInMs: number,
    driftMultiplier: number,
    executeAtStart: boolean,
    abortSignal: AbortSignal
): Promise<void> => {
    if (abortSignal?.aborted) {
        return
    }
    if (executeAtStart) {
        await task()
    }
    return scheduleAtInterval(async () => {
        try {
            await wait(Math.round(Math.random() * approximateIntervalInMs * 2 * driftMultiplier), abortSignal)
        } catch {
            // the abort signal timeouted, ignore
        }
        if (!abortSignal.aborted) {
            await task()
        }
    }, approximateIntervalInMs * (1 - driftMultiplier), false, abortSignal)
}
