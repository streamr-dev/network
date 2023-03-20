import { get, set, createStore, UseStore } from 'idb-keyval'
import { PersistenceContext } from './PersistenceContext'
import { Mapping } from '../Mapping'

// TODO remove generics?

export default class BrowserPersistence<K extends string, V extends string> implements PersistenceContext<K, V> {
    
    private readonly stores: Mapping<[string], UseStore>

    constructor({ clientId }: { clientId: string }) {
        this.stores = new Mapping(async (namespace: string) => {
            return createStore(`streamr-client::${clientId}`, namespace)
        })
    }

    async get(key: K, namespace: string): Promise<V | undefined> {
        return get(key, await this.stores.get(namespace))
    }

    async set(key: K, value: V, namespace: string): Promise<void> {
        await set(key, value, await this.stores.get(namespace))
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }
}
