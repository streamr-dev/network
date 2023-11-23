import { Logger } from './Logger'

const logger = new Logger(module)

/**
 * Execute a promise that should never reject. If it does, log the error and exit the process.
 * To be used in places where we want to "annotate" that the intention of a promise is never
 * to reject (unless something is really wrong).
 */
export const executeSafePromise = async <T>(createPromise: () => Promise<T>): Promise<T> => {
    try {
        return await createPromise()
    } catch (error: any) {
        logger.fatal('Assertion failure!', { message: error?.message, stack: error?.stack })
        process.exit(1)
    }
}
