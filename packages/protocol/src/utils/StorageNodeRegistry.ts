import { Contract, providers } from 'ethers'
import { ConnectionInfo } from 'ethers/lib/utils'

import * as storageNodeRegistryConfig from '../../contracts/NodeRegistry.json'

const { JsonRpcProvider } = providers

// storageNodeAddress => HTTP address
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

async function fetchStorageNodes(contractAddress: string, jsonRpcProvider: string | ConnectionInfo): Promise<StorageNodeInfo[]> {
    const provider = new JsonRpcProvider(jsonRpcProvider)
    // check that provider is connected and has some valid blockNumber
    await provider.getBlockNumber()

    const contract = new Contract(contractAddress, storageNodeRegistryConfig.abi, provider)
    // check that contract is connected
    await contract.addressPromise

    if (typeof contract.getNodes !== 'function') {
        throw Error(`getNodes function is not defined in smart contract (${contractAddress})`)
    }

    const result = await contract.getNodes()
    return result.map((node: any) => {
        return {
            address: node.nodeAddress,
            url: JSON.parse(node.metadata).http
        }
    })
}

export function createStorageNodeRegistry(servers: StorageNodeInfo[]): StorageNodeRegistry {
    return new StorageNodeRegistry(servers)
}

export async function getStorageNodeRegistryFromContract({
    contractAddress,
    jsonRpcProvider
}: {
    contractAddress: string,
    jsonRpcProvider: string | ConnectionInfo
}): Promise<StorageNodeRegistry> {
    const storageNodes = await fetchStorageNodes(contractAddress, jsonRpcProvider)
    return createStorageNodeRegistry(storageNodes)
}
