import { JsonRpcProvider } from '@ethersproject/providers'
import { Contract } from '@ethersproject/contracts'
import { createStorageNodeRegistry, StorageNodeInfo } from 'streamr-client-protocol/dist/src/utils/StorageNodeRegistry'
import { StorageNodeRegistry } from 'streamr-client-protocol'

type ProviderConnectionInfo = ConstructorParameters<typeof JsonRpcProvider>[0]

import * as storageNodeRegistryConfig from '../contracts/NodeRegistry.json'

async function fetchStorageNodes(contractAddress: string, jsonRpcProvider: ProviderConnectionInfo): Promise<StorageNodeInfo[]> {
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

export async function getStorageNodeRegistryFromContract({
    contractAddress,
    jsonRpcProvider
}: {
    contractAddress: string,
    jsonRpcProvider: ProviderConnectionInfo
}): Promise<StorageNodeRegistry> {
    const storageNodes = await fetchStorageNodes(contractAddress, jsonRpcProvider)
    return createStorageNodeRegistry(storageNodes)
}
