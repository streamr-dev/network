import { get, set, del, clear, keys, createStore, UseStore } from 'idb-keyval'
import { PersistentStore } from './PersistentStore'
import { StreamID } from 'streamr-client-protocol'

export default class BrowserPersistentStore implements PersistentStore<string, string> {
    private store: UseStore
    private dbName: string

    constructor({ clientId, streamId }: { clientId: string, streamId: StreamID }) {
        this.dbName = `streamr-client::${clientId}::${streamId}`
        this.store = createStore(this.dbName, 'GroupKeys')
    }

    async has(key: string): Promise<boolean> {
        const val = await this.get(key)
        return val == null
    }

    async get(key: string): Promise<string | undefined> {
        return get(key, this.store)
    }

    async set(key: string, value: string): Promise<boolean> {
        const had = await this.has(key)
        await set(key, value, this.store)
        return had
    }

    async delete(key: string): Promise<boolean> {
        if (!await this.has(key)) {
            return false
        }

        await del(key, this.store)
        return true
    }

    async clear(): Promise<boolean> {
        const size = await this.size()
        await clear(this.store)
        return !!size
    }

    async size(): Promise<number> {
        const allKeys = await keys(this.store)
        return allKeys.length
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }

    async destroy(): Promise<void> {
        await this.clear()
        await this.close()
    }

    async exists(): Promise<boolean> { // eslint-disable-line class-methods-use-this
        // always true for browser
        // can't currently implement without opening db, defeating purpose
        // waiting for indexedDB.databases() to gain browser support.
        return true
    }

    get [Symbol.toStringTag](): string {
        return this.constructor.name
    }
}
