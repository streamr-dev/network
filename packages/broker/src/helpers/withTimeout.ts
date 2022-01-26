export class TimeoutError extends Error {
    code: string

    constructor(message: string, code: string) {
        super(message)
        this.code = code
    }
}

export const withTimeout = async <T>(promise: Promise<T>, timeout: number, errorCode: string): Promise<T> => {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError('Timeout', errorCode))
        }, timeout)
        let result
        try {
            result = await promise
            clearTimeout(timer)
            resolve(result)
        } catch (e) {
            clearTimeout(timer)
            reject(e)
        }
    })
}
