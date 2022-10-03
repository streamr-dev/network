import { get, set, createStore, UseStore } from 'idb-keyval'
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

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }

    get [Symbol.toStringTag](): string {
        return this.constructor.name
    }
}
