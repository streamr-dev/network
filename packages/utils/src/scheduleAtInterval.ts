/*
 * @param {number} interval - number of milliseconds to wait after a task is completed
 */
import { repeatScheduleTask } from './scheduleAtFixedRate'

export const scheduleAtInterval = async (
    task: () => Promise<void>,
    interval: number,
    executeAtStart: boolean
): Promise<{ stop: () => void }> => {
    if (executeAtStart) {
        await task()
    }
    return repeatScheduleTask((doneCb) => {
        return setTimeout(async () => {
            await task()
            doneCb()
        }, interval)
    })
}
