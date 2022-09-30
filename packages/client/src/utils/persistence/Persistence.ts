export interface Persistence<K, V> {
    get(key: K): Promise<V | undefined>
    set(key: K, value: V): Promise<void>
    close(): Promise<void>
    exists(): Promise<boolean>
}
