/**
 * Wait for a condition to become true by re-evaluating `conditionFn` every `retryInterval` milliseconds.
 *
 * @param conditionFn condition to be evaluated; should return boolean or Promise<boolean> and have
 * no side effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @param onTimeoutContext evaluated only on timeout. Used to associate human-friendly textual context to error.
 * @returns {Promise<void>} resolves immediately if
 * conditionFn evaluates to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
export const waitForCondition = async (
    conditionFn: () => (boolean | Promise<boolean>),
    timeout = 5000,
    retryInterval = 100,
    onTimeoutContext?: () => string
): Promise<void> => {
    // create error beforehand to capture more usable stack
    const err = new Error(`waitForCondition: timed out before "${conditionFn.toString()}" became true`)
    return new Promise((resolve, reject) => {
        let poller: NodeJS.Timeout | undefined = undefined
        const clearPoller = () => {
            if (poller !== undefined) {
                clearInterval(poller)
            }
        }
        const maxTime = Date.now() + timeout
        const poll = async () => {
            if (Date.now() < maxTime) {
                let result
                try {
                    result = await conditionFn()
                } catch (err) {
                    clearPoller()
                    reject(err)
                }
                if (result) {
                    clearPoller()
                    resolve()
                }
            } else {
                clearPoller()
                if (onTimeoutContext) {
                    err.message += `\n${onTimeoutContext()}`
                }
                reject(err)
            }
        }
        setTimeout(poll, 0)
        poller = setInterval(poll, retryInterval)
    })
}
