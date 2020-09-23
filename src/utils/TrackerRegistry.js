import HashRing from 'hashring'
import { Contract, providers } from 'ethers'

import * as trackerRegistryConfig from '../../contracts/TrackerRegistry.json'

const { JsonRpcProvider } = providers

class TrackerRegistry extends HashRing {
    getTracker(streamKey) {
        return this.get(streamKey)
    }

    getAllTrackers() {
        return Object.keys(this.vnodes)
    }
}

const fetchTrackers = async (contractAddress, jsonRpcProvider) => {
    const provider = new JsonRpcProvider(jsonRpcProvider)
    // check that provider is connected and has some valid blockNumber
    await provider.getBlockNumber()

    const contract = new Contract(contractAddress, trackerRegistryConfig.abi, provider)
    // check that contract is connected
    await contract.addressPromise

    if (typeof contract.getNodes !== 'function') {
        throw Error('getNodes is not defined in contract')
    }

    const result = await contract.getNodes()
    return result.map((tracker) => tracker.url)
}

// algorithm is from https://nodejs.org/api/crypto.html or by `openssl list -digest-algorithms`
const getTrackerRegistryFromContract = async ({ contractAddress, jsonRpcProvider, algorithm = 'sha256', hashRingOptions }) => {
    const trackers = await fetchTrackers(contractAddress, jsonRpcProvider)
    return new TrackerRegistry(trackers, algorithm, hashRingOptions)
}

const createTrackerRegistry = (servers, algorithm = 'sha256', hashRingOptions) => new TrackerRegistry(servers, algorithm, hashRingOptions)

export {
    TrackerRegistry,
    getTrackerRegistryFromContract,
    createTrackerRegistry,
    fetchTrackers
}
