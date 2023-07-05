declare module 'consistent-hash' {
    export default class ConsistentHash {
        constructor(options?: {
            range?: number
            weight?: number
            distribution?: 'uniform' | string
        })

        add(node: string): ConsistentHash

        get(name: string): string

        remove(node: string): ConsistentHash
    }
}
