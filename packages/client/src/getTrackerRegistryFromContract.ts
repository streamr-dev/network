import { getDefaultProvider, JsonRpcProvider } from '@ethersproject/providers'
import { Contract } from '@ethersproject/contracts'
import { createTrackerRegistry, SmartContractRecord, TrackerRegistry } from 'streamr-client-protocol'
import * as trackerRegistryConfig from '../contracts/TrackerRegistry.json'

type ProviderConnectionInfo = ConstructorParameters<typeof JsonRpcProvider>[0]

async function fetchTrackers(contractAddress: string, jsonRpcProvider?: ProviderConnectionInfo) {
    let provider
    if (jsonRpcProvider) {
        provider = new JsonRpcProvider(jsonRpcProvider)
    } else {
        provider = getDefaultProvider()
    }
    // check that provider is connected and has some valid blockNumber
    await provider.getBlockNumber()

    const contract = new Contract(contractAddress, trackerRegistryConfig.abi, provider)
    // check that contract is connected
    await contract.addressPromise

    if (typeof contract.getNodes !== 'function') {
        throw Error(`getNodes function is not defined in smart contract (${contractAddress})`)
    }

    return contract.getNodes()
}

export async function getTrackerRegistryFromContract({
    contractAddress,
    jsonRpcProvider
}: {
    contractAddress: string,
    jsonRpcProvider?: ProviderConnectionInfo
}): Promise<TrackerRegistry<SmartContractRecord>> {
    const trackers = await fetchTrackers(contractAddress, jsonRpcProvider)
    const records: SmartContractRecord[] = []
    for (let i = 0; i < trackers.length; ++i) {
        const { metadata, url, nodeAddress } = trackers[i]
        try {
            // The field is tracker.metadata in newer contracts and tracker.url in old contracts.
            // It's safe to clean up tracker.url when no such contract is used anymore.
            const urls = JSON.parse(metadata || url)
            records.push({
                id: nodeAddress,
                ...urls
            })
        } catch (e) {
            throw new Error(`Element trackers[${i}] not parsable as object: ${trackers[i]}`)
        }
    }
    return createTrackerRegistry(records)
}
