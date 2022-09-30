import { get, set,  clear, createStore, UseStore } from 'idb-keyval'
import { Persistence } from './Persistence'
import { StreamID } from 'streamr-client-protocol'

export default class BrowserPersistence implements Persistence<string, string> {
    private store: UseStore
    private dbName: string

    constructor({ clientId, streamId }: { clientId: string, streamId: StreamID }) {
        this.dbName = `streamr-client::${clientId}::${streamId}`
        this.store = createStore(this.dbName, 'GroupKeys')
    }

    async get(key: string): Promise<string | undefined> {
        return get(key, this.store)
    }

    async set(key: string, value: string): Promise<void> {
        await set(key, value, this.store)
    }

    private async clear(): Promise<void> {
        await clear(this.store)
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
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
