export type StorageNodeInfo = {
    address: string
    url: string
}

export class StorageNodeRegistry {
    private readonly records: StorageNodeInfo[]

    constructor(records: StorageNodeInfo[]) {
        this.records = records
    }

    getStorageNodeHTTP(address: string): string | never {
        const found = this.records.find((p) => p.address === address)
        if (found) {
            return found.url
        } else {
            throw new Error(`Storage node with address (${address}) not found in registry`)
        }
    }

    getAllStorageNodes(): StorageNodeInfo[] {
        return this.records
    }
}
export function createStorageNodeRegistry(servers: StorageNodeInfo[]): StorageNodeRegistry {
    return new StorageNodeRegistry(servers)
}

