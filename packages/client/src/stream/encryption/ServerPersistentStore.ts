import envPaths from 'env-paths'
import { dirname, resolve, join } from 'path'
import { promises as fs } from 'fs'
import { open, Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import Debug from 'debug'

import { PersistentStore } from './GroupKeyStore'
import { counterId, pOnce } from '../../utils'

// eslint-disable-next-line promise/param-names
const wait = (ms: number) => new Promise((resolveFn) => setTimeout(resolveFn, ms))

export type ServerPersistentStoreOptions = {
    clientId: string
    streamId: string
    initialData?: Record<string, string>
    rootPath?: string,
    migrationsPath?: string,
}

export default class ServerPersistentStore implements PersistentStore<string, string> {
    readonly id: string
    readonly clientId: string
    readonly streamId: string
    readonly dbFilePath: string
    private store?: Database
    private error?: Error
    private readonly initialData
    readonly migrationsPath: string
    readonly debug

    constructor({
        clientId,
        streamId,
        initialData = {},
        rootPath = './',
        migrationsPath = join(__dirname, 'migrations')
    }: ServerPersistentStoreOptions) {
        this.id = counterId(this.constructor.name)
        this.debug = Debug(`StreamrClient::${this.id}`)
        this.streamId = encodeURIComponent(streamId)
        this.clientId = encodeURIComponent(clientId)
        this.initialData = initialData
        const paths = envPaths('streamr-client')
        const dbFilePath = resolve(paths.data, join(rootPath, clientId, 'GroupKeys.db'))
        this.dbFilePath = dbFilePath
        this.migrationsPath = migrationsPath
        this.init = pOnce(this.init.bind(this))
        this.init().catch(() => {
            // ignore error until used
            // prevent unhandled rejection
        })
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

    async init() {
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

    async get(key: string) {
        await this.init()
        const value = await this.store!.get('SELECT groupKey FROM GroupKeys WHERE id = ? AND streamId = ?', key, this.streamId)
        return value?.groupKey
    }

    async has(key: string) {
        await this.init()
        const value = await this.store!.get('SELECT COUNT(*) FROM GroupKeys WHERE id = ? AND streamId = ?', key, this.streamId)
        return !!(value && value['COUNT(*)'] != null && value['COUNT(*)'] !== 0)
    }

    private async setKeyValue(key: string, value: string) {
        // set, but without init so init can insert initialData
        const result = await this.store!.run('INSERT INTO GroupKeys VALUES ($id, $groupKey, $streamId) ON CONFLICT DO NOTHING', {
            $id: key,
            $groupKey: value,
            $streamId: this.streamId,
        })

        return !!result?.changes
    }

    async set(key: string, value: string) {
        await this.init()
        return this.setKeyValue(key, value)
    }

    async delete(key: string) {
        await this.init()
        const result = await this.store!.run('DELETE FROM GroupKeys WHERE id = ? AND streamId = ?', key, this.streamId)
        return !!result?.changes
    }

    async clear() {
        await this.init()
        const result = await this.store!.run('DELETE FROM GroupKeys WHERE streamId = ?', this.streamId)
        return !!result?.changes
    }

    async size() {
        await this.init()
        const size = await this.store!.get('SELECT COUNT(*) FROM GroupKeys WHERE streamId = ?;', this.streamId)
        return size && size['COUNT(*)']
    }

    async close() {
        this.debug('close')
        await this.init()
        await this.store!.close()
    }

    async destroy() {
        this.debug('destroy')
        await this.clear()
        await this.close()
        this.init = pOnce(Object.getPrototypeOf(this).init.bind(this))
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
