import { Contract } from '@ethersproject/contracts'
import type { Provider } from '@ethersproject/providers'
import { createTrackerRegistry, TrackerRegistry, TrackerRegistryRecord } from '@streamr/protocol'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { StrictStreamrClientConfig, TrackerRegistryContract } from '../Config'
import { getMainnetProviders } from '../Ethereum'
import * as trackerRegistryConfig from '../ethereumArtifacts/TrackerRegistry.json'
import { tryInSequence } from '../utils/promises'

async function fetchTrackers(contractAddress: EthereumAddress, jsonRpcProvider: Provider) {
    // check that provider is connected and has some valid blockNumber
    await jsonRpcProvider.getBlockNumber()

    const contract = new Contract(contractAddress, trackerRegistryConfig.abi, jsonRpcProvider)
    // check that contract is connected
    await contract.addressPromise

    if (typeof contract.getNodes !== 'function') {
        throw Error(`getNodes function is not defined in smart contract (${contractAddress})`)
    }

    return contract.getNodes()
}

async function getTrackerRegistryFromContract(contractAddress: EthereumAddress, rpcProvider: Provider): Promise<TrackerRegistry<TrackerRegistryRecord>> {
    const trackers = await fetchTrackers(contractAddress, rpcProvider)
    const records: TrackerRegistryRecord[] = []
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

export const getTrackers = async (config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>): Promise<TrackerRegistryRecord[]> => {
    return ('contractAddress' in config.network.trackers)
        ? tryInSequence(
            getMainnetProviders(config).map((provider) => {
                return async () => {
                    const address = toEthereumAddress((config.network.trackers as TrackerRegistryContract).contractAddress)
                    const registry = await getTrackerRegistryFromContract(address, provider)
                    return registry.getAllTrackers()
                }
            })
        )
        : config.network.trackers
}
