export const withTimeout = async <T>(promise: Promise<T>, timeout: number): Promise<T> => {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout'))
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
