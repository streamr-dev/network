export interface Persistence<K, V> {
    get(key: K): Promise<V | undefined>
    set(key: K, value: V): Promise<void>
    has(key: K): Promise<boolean>
    close(): Promise<void>
    destroy(): Promise<void>
    exists(): Promise<boolean>
}
