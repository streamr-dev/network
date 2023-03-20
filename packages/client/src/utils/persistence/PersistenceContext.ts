// TODO: make into abstract base class and define abstract constructor to enforce options?
export interface PersistenceContext<K extends string, V extends string> {
    get(key: K, namespace: string): Promise<V | undefined>
    set(key: K, value: V, namespace: string): Promise<void>
    close(): Promise<void>
}
