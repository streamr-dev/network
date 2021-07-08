import { PersistentStore } from './GroupKeyStore'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { setItem, getItem, removeItem, clear, getAllKeys } = AsyncStorage

export default class ReactNativePersistentStore implements PersistentStore<string, string> {
    readonly clientId: string
    readonly streamId: string

    constructor({ clientId, streamId }: { clientId: string, streamId: string }) {
        this.streamId = encodeURIComponent(streamId)
        this.clientId = encodeURIComponent(clientId)
    }

    async has(key: string) {
        const val = await this.get(key)
        return val == null
    }

    // eslint-disable-next-line class-methods-use-this
    async get(key: string) {
        const value = await getItem(key)
        return value || undefined
    }

    async set(key: string, value: string) {
        const had = await this.has(key)
        await setItem(key, value,)
        return had
    }

    async delete(key: string) {
        if (!await this.has(key)) {
            return false
        }

        await removeItem(key,)
        return true
    }

    // eslint-disable-next-line class-methods-use-this
    async clear() {
        await clear()
        return !!await this.size()
    }

    // eslint-disable-next-line class-methods-use-this
    async size() {
        const allKeys = await getAllKeys()
        return allKeys.length
    }

    // eslint-disable-next-line class-methods-use-this
    async close() {
        // noop
    }

    async destroy() {
        await this.clear()
        await this.close()
    }

    async exists() { // eslint-disable-line class-methods-use-this
        return !!AsyncStorage
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
