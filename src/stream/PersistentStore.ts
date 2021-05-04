import { once } from 'events'
import envPaths from 'env-paths'
import Level from 'level'
// @ts-expect-error
import LevelParty from 'level-party'
import { dirname, join } from 'path'
import fs from 'fs/promises'

import { GroupKey } from './Encryption'
import { pOnce } from '../utils'

class ServerStorage {
    readonly id: string
    readonly dbFilePath: string
    private readonly store: Level.LevelDB
    private error?: Error

    constructor(id: string) {
        this.id = encodeURIComponent(id)
        const paths = envPaths('streamr-client')
        const dbFilePath = join(paths.data, `${id}.db`)
        this.dbFilePath = dbFilePath
        const Store = LevelParty as Level.Constructor
        this.store = Store(dbFilePath, { valueEncoding: 'json' }, (err) => {
            this.error = err
        })

        this.init = pOnce(this.init.bind(this))
    }

    async init() {
        try {
            await fs.mkdir(dirname(this.dbFilePath), { recursive: true })
            await this.store.open()
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
        const value = await this.store.get(key).catch((err) => {
            if (err.notFound) { return }
            throw err
        })
        return value
    }

    async set(key: string, value: any) {
        await this.init()
        return this.store.put(key, value)
    }

    async delete(key: string) {
        await this.init()
        return this.store.del(key).catch((err) => {
            if (err.notFound) { return }
            throw err
        })
    }

    async clear() {
        await this.init()
        return this.store.clear()
    }

    async size() {
        await this.init()
        let count = 0
        const keyStream = this.store.createKeyStream({ keys: false, values: true }).on('data', () => {
            count += 1
        })
        await once(keyStream, 'end')
        return count
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}

export default class GroupKeyStore {
    store: ServerStorage
    constructor({ clientId, streamId }: { clientId: string, streamId: string }) {
        this.store = new ServerStorage(`${clientId}-${streamId}`)
    }

    async has(groupKeyId: string) {
        const value = await this.store.get(groupKeyId)
        return value != null
    }

    async size() {
        return this.store.size()
    }

    async get(groupKeyId: string) {
        const value = await this.store.get(groupKeyId)
        if (!value) { return undefined }
        return GroupKey.from(value)
    }

    async set(groupKeyId: string, value: GroupKey) {
        return this.store.set(groupKeyId, value)
    }

    async delete(groupKeyId: string) {
        return this.store.delete(groupKeyId)
    }

    async clear() {
        return this.store.clear()
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
