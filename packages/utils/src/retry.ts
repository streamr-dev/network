import { wait } from './wait'

export const retry = async <T>(
    task: () => Promise<T>,
    onRetryableFailure: (message: string, error: any) => void,
    description: string,
    maxCount: number,
    delay: number
): Promise<T> => {
    for (let i = 0; i < maxCount; i++) {
        try {
            const result = await task()
            return result
        } catch (err: any) {
            if (i < maxCount - 1) {
                const message = `${description} failed, retrying in ${delay} ms`
                onRetryableFailure(message, err)
                await wait(delay)
            }
        }
    }
    throw new Error(`${description} failed after ${maxCount} attempts`)
}
