declare module 'consistent-hash' {
    export default class ConsistentHash {
        constructor(options?: { range?: number; weight?: number; distribution?: 'uniform' | string })

        add(node: string): ConsistentHash

        get(name: string, count: number): string[] | null

        remove(node: string): ConsistentHash
    }
}
