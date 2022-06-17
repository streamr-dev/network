export class TimeoutError extends Error {
    readonly code: string

    constructor(message: string, code: string) {
        super(message)
        this.code = code
    }
}

export const withTimeout = <T>(promise: Promise<T>, timeoutInMs: number, errorCode: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
            const timeoutRef = setTimeout(() => {
                reject(new TimeoutError(`timed out in ${timeoutInMs} ms`, errorCode))
            }, timeoutInMs)
            promise
                .finally(() => {
                    clearTimeout(timeoutRef)
                })
                .catch(() => {}) // clear timeout if promise wins race
        })
    ])
}
