import { Logger } from './Logger'

/**
 * Execute a promise that should never reject. If it does, log the error and exit the process
 * (in Node/Electron) or throw an unhandled error (in browsers).
 * To be used in places where we want to "annotate" that the intention of a promise is never
 * to reject (unless something is really wrong).
 */
export const executeSafePromise = async <T>(createPromise: () => Promise<T>): Promise<T> => {
    
    try {
        return await createPromise()
    } catch (err: any) {
        const logger = new Logger('executeSafePromise')
        logger.fatal('Assertion failure!', { message: err?.message, err })
        
        // Check if we're in a Node/Electron environment
        if (typeof process !== 'undefined' && process.exit !== undefined) {
            process.exit(1)
        } else {
            // Browser environment - throw with proper error chaining
            throw new Error('executeSafePromise: Assertion failure!', { cause: err })
        }
    }
}
