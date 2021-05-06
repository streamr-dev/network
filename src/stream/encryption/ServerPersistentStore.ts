import envPaths from 'env-paths'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import { open, Database } from 'sqlite'
import sqlite3 from 'sqlite3'

import { PersistentStore } from './GroupKeyStore'
import { pOnce } from '../../utils'

export default class ServerPersistentStore implements PersistentStore<string, string> {
    readonly clientId: string
    readonly streamId: string
    readonly dbFilePath: string
    private store?: Database
    private error?: Error

    constructor({ clientId, streamId }: { clientId: string, streamId: string }) {
        this.streamId = encodeURIComponent(streamId)
        this.clientId = encodeURIComponent(clientId)
        const paths = envPaths('streamr-client')
        const dbFilePath = join(paths.data, clientId, 'GroupKeys.db')
        this.dbFilePath = dbFilePath

        this.init = pOnce(this.init.bind(this))
    }

    async init() {
        try {
            await fs.mkdir(dirname(this.dbFilePath), { recursive: true })
            // open the database
            const store = await open({
                filename: this.dbFilePath,
                driver: sqlite3.Database
            })
            await store.exec(`CREATE TABLE IF NOT EXISTS GroupKeys (
                id TEXT,
                groupKey TEXT,
                streamId TEXT
            )`)
            await store.exec('CREATE UNIQUE INDEX IF NOT EXISTS name ON GroupKeys (id)')
            this.store = store
        } catch (err) {
            if (!this.error) {
                this.error = err
            }
        }

        if (this.error) {
            throw this.error
        }
    }

    async get(key: string) {
        await this.init()
        const value = await this.store!.get('SELECT groupKey FROM GroupKeys WHERE id = ? AND streamId = ?', key, this.streamId)
        return value?.groupKey
    }

    async has(key: string) {
        await this.init()
        const value = await this.store!.get('SELECT COUNT(*) FROM GroupKeys WHERE id = ? AND streamId = ?', key, this.streamId)
        return value && value['COUNT(*)'] != null && value['COUNT(*)'] !== 0
    }

    async set(key: string, value: string) {
        await this.init()
        const result = await this.store!.run('INSERT INTO GroupKeys VALUES ($id, $groupKey, $streamId) ON CONFLICT DO NOTHING', {
            $id: key,
            $groupKey: value,
            $streamId: this.streamId,
        })

        return !!result?.changes
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

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
