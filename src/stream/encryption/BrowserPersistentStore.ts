import { PersistentStore } from './GroupKeyStore'
import { get, set, del, clear, keys, createStore } from 'idb-keyval'

export default class BrowserPersistentStore implements PersistentStore<string, string> {
    readonly clientId: string
    readonly streamId: string
    private store?: any

    constructor({ clientId, streamId }: { clientId: string, streamId: string }) {
        this.streamId = encodeURIComponent(streamId)
        this.clientId = encodeURIComponent(clientId)
        this.store = createStore(`streamr-client::${clientId}::${streamId}`, 'GroupKeys')
    }

    async has(key: string) {
        const val = await this.get(key)
        return val == null
    }

    async get(key: string) {
        return get(key, this.store)
    }

    async set(key: string, value: string) {
        const had = await this.has(key)
        await set(key, value, this.store)
        return had
    }

    async delete(key: string) {
        if (!await this.has(key)) {
            return false
        }

        await del(key, this.store)
        return true
    }

    async clear() {
        const size = await this.size()
        await clear(this.store)
        return !!size
    }

    async size() {
        const allKeys = await keys(this.store)
        return allKeys.length
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
