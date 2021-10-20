import { GenericError } from '../errors/GenericError'

export const withTimeout = async <T>(promise: Promise<T>, timeout: number, errorCode: string): Promise<T> => {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new GenericError('Timeout', errorCode))
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
