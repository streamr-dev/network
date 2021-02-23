import Conf from 'conf'

export interface PersistentStorage extends Map<string, any> {
    id: string
}

export default class ServerStorage implements PersistentStorage {
    id: string
    config: Conf
    constructor(id: string) {
        this.id = id
        this.config = new Conf({
            projectName: 'streamr-client',
            configName: id,
        })
    }

    has(key: string) {
        return this.config.has(key)
    }

    get(key: string) {
        return this.config.get(key)
    }

    keys() {
        return Object.keys(this.config.store)[Symbol.iterator]()
    }

    values() {
        return Object.values(this.config.store)[Symbol.iterator]()
    }

    entries() {
        return Object.entries(this.config.store)[Symbol.iterator]()
    }

    forEach(...args: Parameters<Map<string, unknown>['forEach']>) {
        return new Map(Object.entries(this.config.store)).forEach(...args)
    }

    set(key: string, value: any) {
        this.config.set(key, value)
        return this
    }

    delete(key: string) {
        const had = this.config.has(key)
        this.config.delete(key)
        return had
    }

    clear() {
        return this.config.clear()
    }

    get size() {
        return this.config.size
    }

    [Symbol.iterator]() {
        return new Map(Object.entries(this.config.store))[Symbol.iterator]()
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
