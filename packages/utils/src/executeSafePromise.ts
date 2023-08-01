import { Logger } from './Logger'

const logger = new Logger(module)

export const executeSafePromise = async <T>(createPromise: () => Promise<T>): Promise<T> => {
    try {
        return await createPromise()
    } catch (error: any) {
        logger.error(`Assertion failed! A safe promise threw an error: ${error?.message}`, { stack: error?.stack })
        return new Promise(() => {}) as any  // never resolves
    }
}
