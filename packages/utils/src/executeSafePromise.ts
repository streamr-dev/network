import { Logger } from './Logger'

const logger = new Logger('executeSafePromise')

/**
 * Execute a promise that should never reject. If it does, log the error and exit the process.
 * To be used in places where we want to "annotate" that the intention of a promise is never
 * to reject (unless something is really wrong).
 */
export const executeSafePromise = async <T>(createPromise: () => Promise<T>): Promise<T> => {
    try {
        return await createPromise()
    } catch (err: any) {
        logger.fatal('Assertion failure!', { message: err?.message, err })
        if (process.exit !== undefined) {
            process.exit(1)
        } else {
            // cause an unhandled promise rejection on purpose
            throw new Error('executeSafePromise: Assertion failure!', err)
        }
    }
}
