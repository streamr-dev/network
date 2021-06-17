/*
 * @param {number} interval - number of milliseconds to wait after a task is completed
 */
export const scheduleAtInterval = async (
    task: () => Promise<void>, 
    interval: number,
    executeAtStart: boolean
): Promise<{ stop: () => void }> => {
    let timer: NodeJS.Timer|undefined
    let stopRequested = false
    const scheduleNext = () => {
        timer = setTimeout(async () => {
            await task()
            scheduleNext()
        }, interval)
    }
    if (executeAtStart) {
        await task()
    }
    if (!stopRequested) {
        scheduleNext()
    }
    return {
        stop: () => {
            stopRequested = true
            clearTimeout(timer!)
        }
    }
}
