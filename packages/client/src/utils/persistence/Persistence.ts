export interface Persistence<K extends string, V extends string> {
    get(key: K): Promise<V | undefined>
    set(key: K, value: V): Promise<void>
}
