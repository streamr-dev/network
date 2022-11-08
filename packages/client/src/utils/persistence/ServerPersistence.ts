import envPaths from 'env-paths'
import { dirname, resolve, join } from 'path'
import { promises as fs } from 'fs'
import { open, Database } from 'sqlite'
import sqlite3 from 'sqlite3'

import { pOnce } from '../promises'

import { Persistence } from './Persistence'
import { StreamID } from '@streamr/protocol'
import { Logger, wait } from '@streamr/utils'
import { LoggerFactory } from '../LoggerFactory'

export interface ServerPersistenceOptions {
    loggerFactory: LoggerFactory
    tableName: string
    valueColumnName: string
    clientId: string
    migrationsPath?: string
    onInit?: (db: Database) => Promise<void>
}

/*
 * Stores key-value pairs for a given stream
 */
export default class ServerPersistence implements Persistence<string, string> {
    private readonly logger: Logger
    private readonly tableName: string
    private readonly valueColumnName: string
    private readonly dbFilePath: string
    private store?: Database
    private error?: Error
    private initCalled = false
    private readonly migrationsPath?: string
    private readonly onInit?: (db: Database) => Promise<void>

    constructor({
        loggerFactory,
        clientId,
        tableName,
        valueColumnName,
        migrationsPath,
        onInit
    }: ServerPersistenceOptions) {
        this.logger = loggerFactory.createLogger(module)
        this.tableName = tableName
        this.valueColumnName = valueColumnName
        const paths = envPaths('streamr-client')
        const dbFilePath = resolve(paths.data, join('./', clientId, `${tableName}.db`))
        this.dbFilePath = dbFilePath
        this.migrationsPath = migrationsPath
        this.onInit = onInit
        this.init = pOnce(this.init.bind(this))
    }

    async exists(): Promise<boolean> {
        if (this.initCalled) {
            // wait for init if in progress
            await this.init()
        }

        try {
            await fs.access(this.dbFilePath)
            return true
        } catch (err) {
            if (err.code === 'ENOENT') {
                return false
            }

            throw err
        }
    }

    private async tryExec<T>(fn: () => Promise<T>, maxRetries = 10, retriesLeft = maxRetries): Promise<T> {
        try {
            return await fn()
        } catch (err) {
            if (retriesLeft > 0 && err.code === 'SQLITE_BUSY') {
                this.logger.trace('database busy, retrying %d of %d', maxRetries - retriesLeft + 1, maxRetries)
                return this.tryExec(async () => {
                    // wait random time and retry
                    await wait(10 + Math.random() * 500)
                    return fn()
                }, maxRetries, retriesLeft - 1)
            }

            throw err
        }
    }

    async init(): Promise<void> {
        this.initCalled = true
        try {
            await fs.mkdir(dirname(this.dbFilePath), { recursive: true })
            // open the database
            const store = await open({
                filename: this.dbFilePath,
                driver: sqlite3.Database
            })
            await this.tryExec(async () => {
                await store.configure('busyTimeout', 200)
                await store.run('PRAGMA journal_mode = WAL;')
            })
            if (this.migrationsPath !== undefined) {
                await this.tryExec(async () => {
                    try {
                        await store.migrate({
                            migrationsPath: this.migrationsPath
                        })
                    } catch (err) {
                        if (err.code.startsWith('SQLITE_')) {
                            // ignore: some other migration is probably running, assume that worked
                            return
                        }
                        throw err
                    }
                })
            }
            await this.onInit?.(store)
            this.store = store
        } catch (err) {
            this.logger.trace('failed to open database, reason: %s', err)
            if (!this.error) {
                this.error = err
            }
        }

        if (this.error) {
            throw this.error
        }

        this.logger.trace('database initialized')
    }

    async get(key: string, streamId: StreamID): Promise<string | undefined> {
        if (!this.initCalled) {
            // can't have if doesn't exist
            if (!(await this.exists())) { return undefined }
        }

        await this.init()
        const value = await this.store!.get(
            `SELECT ${this.valueColumnName} FROM ${this.tableName} WHERE id = ? AND streamId = ?`,
            key,
            encodeURIComponent(streamId)
        )
        return value?.[this.valueColumnName]
    }

    async set(key: string, value: string, streamId: StreamID): Promise<void> {
        await this.init()
        await this.store!.run(
            `INSERT INTO ${this.tableName} VALUES ($id, $${this.valueColumnName}, $streamId) ON CONFLICT DO NOTHING`,
            {
                $id: key,
                [`$${this.valueColumnName}`]: value,
                $streamId: encodeURIComponent(streamId),
            }
        )
    }

    async close(): Promise<void> {
        if (!this.initCalled) {
            // nothing to close if never opened
            return
        }

        await this.init()
        await this.store!.close()
        this.logger.trace('closed')
    }

    get [Symbol.toStringTag](): string {
        return this.constructor.name
    }
}
