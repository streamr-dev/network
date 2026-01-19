import { UserID } from '@streamr/utils'
import { LoggerFactory } from './utils/LoggerFactory'

/**
 * Full persistence context interface with namespace parameter.
 * Implemented by platform-specific Persistence classes.
 */
export interface PersistenceContext {
    get(key: string, namespace: string): Promise<string | undefined>
    set(key: string, value: string, namespace: string): Promise<void>
    close(): Promise<void>
}

/**
 * Namespace-bound persistence interface.
 * Returned by PersistenceManager.getPersistence().
 */
export interface Persistence {
    get(key: string): Promise<string | undefined>
    set(key: string, value: string): Promise<void>
}

/**
 * Unified options for Persistence.createInstance().
 * Browser implementation ignores Node.js-specific fields (loggerFactory, migrationsPath, onInit).
 */
export interface PersistenceOptions {
    ownerId: UserID
    namespaces: string[]
    loggerFactory: LoggerFactory
    migrationsPath?: string
    onInit?: (db: unknown) => Promise<void>
}
