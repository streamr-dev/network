// TODO: make into abstract base class and define abstract constructor to enforce options?
export interface Persistence<K extends string, V extends string> {
    get(key: K): Promise<V | undefined>
    set(key: K, value: V): Promise<void>
    close(): Promise<void>
}
