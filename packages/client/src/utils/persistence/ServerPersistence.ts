import envPaths from 'env-paths'
import { dirname, resolve, join } from 'path'
import { promises as fs } from 'fs'
import { open, Database } from 'sqlite'
import sqlite3 from 'sqlite3'

import { instanceId } from '../utils'
import { pOnce } from '../promises'
import { Context } from '../Context'

import { Persistence } from './Persistence'
import { StreamID } from 'streamr-client-protocol'

// eslint-disable-next-line promise/param-names
const wait = (ms: number) => new Promise((resolveFn) => setTimeout(resolveFn, ms))

export interface ServerPersistenceOptions {
    context: Context
    tableName: string
    valueColumnName: string
    clientId: string
    streamId: StreamID
    initialData?: Record<string, string> // key -> value
    migrationsPath?: string
    onInit?: (db: Database) => Promise<void>
}

/*
 * Stores key-value pairs for a given stream
 */
export default class ServerPersistence implements Persistence<string, string>, Context {
    readonly id: string
    private readonly tableName: string
    private readonly valueColumnName: string
    private readonly streamId: string
    private readonly dbFilePath: string
    private store?: Database
    private error?: Error
    private readonly initialData
    private initCalled = false
    private readonly migrationsPath?: string
    private readonly onInit?: (db: Database) => Promise<void>
    readonly debug

    constructor({
        context,
        clientId,
        streamId,
        tableName,
        valueColumnName,
        initialData = {},
        migrationsPath,
        onInit
    }: ServerPersistenceOptions) {
        this.id = instanceId(this)
        this.tableName = tableName
        this.valueColumnName = valueColumnName
        this.debug = context.debug.extend(this.id)
        this.streamId = encodeURIComponent(streamId)
        this.initialData = initialData
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
                this.debug('DB Busy, retrying %d of %d', maxRetries - retriesLeft + 1, maxRetries)
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
            this.debug('error', err)
            if (!this.error) {
                this.error = err
            }
        }

        if (this.error) {
            throw this.error
        }

        await Promise.all(Object.entries(this.initialData).map(async ([key, value]) => {
            return this.setKeyValue(key, value)
        }))
        this.debug('init')
    }

    async get(key: string): Promise<string | undefined> {
        if (!this.initCalled) {
            // can't have if doesn't exist
            if (!(await this.exists())) { return undefined }
        }

        await this.init()
        const value = await this.store!.get(`SELECT ${this.valueColumnName} FROM ${this.tableName} WHERE id = ? AND streamId = ?`, key, this.streamId)
        return value?.[this.valueColumnName]
    }

    async has(key: string): Promise<boolean> {
        if (!this.initCalled) {
            // can't have if doesn't exist
            if (!(await this.exists())) { return false }
        }

        await this.init()
        const value = await this.store!.get(`SELECT COUNT(*) FROM ${this.tableName} WHERE id = ? AND streamId = ?`, key, this.streamId)
        return !!(value && value['COUNT(*)'] != null && value['COUNT(*)'] !== 0)
    }

    private async setKeyValue(key: string, value: string): Promise<boolean> {
        // set, but without init so init can insert initialData
        const result = await this.store!.run(
            `INSERT INTO ${this.tableName} VALUES ($id, $${this.valueColumnName}, $streamId) ON CONFLICT DO NOTHING`, 
            {
                $id: key,
                [`$${this.valueColumnName}`]: value,
                $streamId: this.streamId,
            }
        )

        return !!result?.changes
    }

    async set(key: string, value: string): Promise<boolean> {
        await this.init()
        return this.setKeyValue(key, value)
    }

    async delete(key: string): Promise<boolean> {
        if (!this.initCalled) {
            // can't delete if if db doesn't exist
            if (!(await this.exists())) { return false }
        }

        await this.init()
        const result = await this.store!.run(`DELETE FROM ${this.tableName} WHERE id = ? AND streamId = ?`, key, this.streamId)
        return !!result?.changes
    }

    async clear(): Promise<boolean> {
        this.debug('clear')
        if (!this.initCalled) {
            // nothing to clear if doesn't exist
            if (!(await this.exists())) { return false }
        }

        await this.init()
        const result = await this.store!.run(`DELETE FROM ${this.tableName} WHERE streamId = ?`, this.streamId)
        return !!result?.changes
    }

    async size(): Promise<number> {
        if (!this.initCalled) {
            // can only have size 0 if doesn't exist
            if (!(await this.exists())) { return 0 }
        }

        await this.init()
        const size = await this.store!.get(`SELECT COUNT(*) FROM ${this.tableName} WHERE streamId = ?;`, this.streamId)
        return size && size['COUNT(*)']
    }

    async close(): Promise<void> {
        this.debug('close')
        if (!this.initCalled) {
            // nothing to close if never opened
            return
        }

        await this.init()
        await this.store!.close()
    }

    async destroy(): Promise<void> {
        this.debug('destroy')
        if (!this.initCalled) {
            // nothing to destroy if doesn't exist
            if (!(await this.exists())) { return }
        }

        await this.clear()
        await this.close()
        this.init = pOnce(Object.getPrototypeOf(this).init.bind(this))
    }

    get [Symbol.toStringTag](): string {
        return this.constructor.name
    }
}
