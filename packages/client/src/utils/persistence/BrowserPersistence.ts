import { get, set, createStore, UseStore } from 'idb-keyval'
import { Persistence } from './Persistence'

export default class BrowserPersistence<K extends string, V extends string> implements Persistence<K, V> {
    private readonly store: UseStore

    constructor({ clientId }: { clientId: string }) {
        this.store = createStore(`streamr-client::${clientId}`, 'GroupKeys')
    }

    async get(key: K): Promise<V | undefined> {
        return get(key, this.store)
    }

    async set(key: K, value: V): Promise<void> {
        await set(key, value, this.store)
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }
}
