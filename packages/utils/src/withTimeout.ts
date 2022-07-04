export class TimeoutError extends Error {
    readonly code = 'TimeoutError'
    constructor(timeoutInMs: number) {
        super(`timed out in ${timeoutInMs} ms`)
        Error.captureStackTrace(this, TimeoutError)
    }
}

export const withTimeout = <T>(promise: Promise<T>, timeoutInMs: number): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
            const timeoutRef = setTimeout(() => {
                reject(new TimeoutError(timeoutInMs))
            }, timeoutInMs)
            promise.finally(() => {
                clearTimeout(timeoutRef) // clear timeout if promise wins race
            }).catch(() => {})
        })
    ])
}
