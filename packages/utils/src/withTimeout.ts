import { asAbortable } from './asAbortable'

export class TimeoutError extends Error {
    readonly code = 'TimeoutError'
    constructor(timeoutInMs: number, customErrorContext?: string) {
        super(
            customErrorContext === undefined
                ? `timed out after ${timeoutInMs} ms`
                : `${customErrorContext} (timed out after ${timeoutInMs} ms)`
        )
    }
}

export const withTimeout = <T>(
    task: Promise<T>,
    timeoutInMs: number,
    customErrorContext?: string,
    abortSignal?: AbortSignal
): Promise<T> => {
    let timeoutRef: NodeJS.Timeout
    return asAbortable(
        Promise.race([
            task,
            new Promise<T>((_resolve, reject) => {
                timeoutRef = setTimeout(() => {
                    reject(new TimeoutError(timeoutInMs, customErrorContext))
                }, timeoutInMs)
            })
        ]),
        abortSignal,
        customErrorContext
    ).finally(() => {
        clearTimeout(timeoutRef)
    })
}
