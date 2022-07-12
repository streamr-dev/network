export class TimeoutError extends Error {
    readonly code = 'TimeoutError'
    constructor(timeoutInMs: number, customErrorContext?: string) {
        super(customErrorContext === undefined
            ? `timed out in ${timeoutInMs} ms`
            : `${customErrorContext} (timed out in ${timeoutInMs} ms)`)
        Error.captureStackTrace(this, TimeoutError)
    }
}

export const withTimeout = <T>(
    task: Promise<T>,
    timeoutInMs: number,
    customErrorContext?: string
): Promise<T> => {
    return Promise.race([
        task,
        new Promise<T>((_resolve, reject) => {
            const timeoutRef = setTimeout(() => {
                reject(new TimeoutError(timeoutInMs, customErrorContext))
            }, timeoutInMs)
            task.finally(() => {
                clearTimeout(timeoutRef) // clear timeout if promise wins race
            }).catch(() => {})
        })
    ])
}
