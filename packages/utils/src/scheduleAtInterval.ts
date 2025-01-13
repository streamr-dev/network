/*
 * @param {number} interval - number of milliseconds to wait after a task is completed
 */
import { repeatScheduleTask } from './scheduleAtFixedRate'
import { setAbortableTimeout } from './abortableTimers'

export const scheduleAtInterval = async (
    task: () => Promise<void>,
    interval: number,
    executeAtStart: boolean,
    abortSignal: AbortSignal
): Promise<void> => {
    if (abortSignal?.aborted) {
        return
    }
    if (executeAtStart) {
        await task()
    }
    repeatScheduleTask((doneCb) => {
        setAbortableTimeout(
            async () => {
                await task()
                doneCb()
            },
            interval,
            abortSignal
        )
    }, abortSignal)
}
