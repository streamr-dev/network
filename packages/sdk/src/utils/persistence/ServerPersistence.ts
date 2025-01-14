import envPaths from 'env-paths'
import { dirname, resolve, join } from 'path'
import { promises as fs } from 'fs'
import { open, Database } from 'sqlite'
import sqlite3 from 'sqlite3'

import { pOnce } from '../promises'

import { PersistenceContext, PersistenceContextOptions } from './PersistenceContext'
import { Logger, wait } from '@streamr/utils'
import { LoggerFactory } from '../LoggerFactory'

export interface ServerPersistenceOptions extends PersistenceContextOptions {
    loggerFactory: LoggerFactory
    migrationsPath?: string
    onInit?: (db: Database) => Promise<void>
}

export default class ServerPersistence implements PersistenceContext {
    private readonly logger: Logger
    private readonly dbFilePath: string
    private store?: Database
    private error?: Error
    private initCalled = false
    private readonly migrationsPath?: string
    private readonly onInit?: (db: Database) => Promise<void>

    // uses createInstance factory pattern so that ServerPersistence and BrowserPersistence
    // are interchangeable
    static async createInstance(opts: ServerPersistenceOptions): Promise<ServerPersistence> {
        // TODO init() call could called here, so that we don't need to separate logic for
        // initialization (i.e. check this.initCalled flag before eaach call).
        // It would be ok to do initialization, because the PersistenceManager already lazy loads
        // and therefore doesn't create this instance before it is needed
        return new ServerPersistence(opts)
    }

    private constructor({ loggerFactory, ownerId, migrationsPath, onInit }: ServerPersistenceOptions) {
        this.logger = loggerFactory.createLogger(module)
        const paths = envPaths('streamr-sdk')
        this.dbFilePath = resolve(paths.data, join('./', ownerId, `GroupKeys.db`))
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
                this.logger.trace('Retry opening database after delay (database busy)', {
                    retryNo: maxRetries - retriesLeft + 1,
                    maxRetries
                })
                return this.tryExec(
                    async () => {
                        // wait random time and retry
                        await wait(10 + Math.random() * 500)
                        return fn()
                    },
                    maxRetries,
                    retriesLeft - 1
                )
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
            this.logger.trace('Failed to open database', err)
            if (!this.error) {
                this.error = err
            }
        }

        if (this.error) {
            throw this.error
        }

        this.logger.trace('Initialized database')
    }

    async get(key: string, namespace: string): Promise<string | undefined> {
        if (!this.initCalled) {
            // can't have if doesn't exist
            if (!(await this.exists())) {
                return undefined
            }
        }

        await this.init()
        const row = await this.store!.get(`SELECT value_ FROM ${namespace} WHERE key_ = ?`, key)
        // eslint-disable-next-line no-underscore-dangle
        return row?.value_
    }

    async set(key: string, value: string, namespace: string): Promise<void> {
        await this.init()
        await this.store!.run(
            `INSERT INTO ${namespace} (key_, value_) VALUES ($key_, $value_) ON CONFLICT DO UPDATE SET value_ = $value_`,
            {
                $key_: key,
                $value_: value
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
    }
}
