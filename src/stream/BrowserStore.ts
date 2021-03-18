import type { PersistentStorage } from './PersistentStore'

export default class BrowserStorage implements PersistentStorage {
    id: string
    constructor(id: string) {
        this.id = `BrowserStorage:${id}`
    }

    private getData() {
        return JSON.parse(window.localStorage.getItem(this.id) || '{}') || {}
    }

    private setData(value: any) {
        return window.localStorage.setItem(this.id, JSON.stringify(value))
    }

    private mergeData(value: any) {
        const data = this.getData()
        return window.localStorage.setItem(this.id, JSON.stringify({
            ...data,
            ...value
        }))
    }

    has(key: string) {
        return !!this.getData()[key]
    }

    get(key: string) {
        return this.getData()[key]
    }

    keys() {
        return Object.keys(this.getData())[Symbol.iterator]()
    }

    values() {
        return Object.values(this.getData())[Symbol.iterator]()
    }

    entries() {
        return Object.entries(this.getData())[Symbol.iterator]()
    }

    forEach(...args: Parameters<Map<string, unknown>['forEach']>) {
        return new Map(Object.entries(this.getData())).forEach(...args)
    }

    set(key: string, value: any) {
        this.mergeData({
            [key]: value,
        })
        return this
    }

    delete(key: string) {
        if (!this.has(key)) {
            return false
        }

        const data = this.getData()
        delete data[key]
        this.setData(data)
        return true
    }

    clear() {
        return this.setData({})
    }

    get size() {
        const data = this.getData()
        return Object.keys(data).length
    }

    [Symbol.iterator]() {
        return new Map(Object.entries(this.getData()))[Symbol.iterator]()
    }

    get [Symbol.toStringTag]() {
        return this.constructor.name
    }
}
