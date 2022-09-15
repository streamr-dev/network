export interface Persistence<K, V> {
    get(key: K): Promise<V | undefined>
    set(key: K, value: V): Promise<boolean>
    has(key: K): Promise<boolean>
    size(): Promise<number>
    close(): Promise<void>
    destroy(): Promise<void>
    exists(): Promise<boolean>
}
