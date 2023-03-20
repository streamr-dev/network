// TODO: make into abstract base class and define abstract constructor to enforce options?
export interface PersistenceContext {
    get(key: string, namespace: string): Promise<string | undefined>
    set(key: string, value: string, namespace: string): Promise<void>
    close(): Promise<void>
}

export interface PersistenceContextOptions {
    clientId: string
    namespaces: string[]
}
