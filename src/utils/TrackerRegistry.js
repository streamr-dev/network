import HashRing from 'hashring'
import { Contract, providers } from 'ethers'

import * as trackerRegistryConfig from '../../contracts/TrackerRegistry.json'

const { JsonRpcProvider } = providers

class TrackerRegistry extends HashRing {
    constructor({
        contractAddress, jsonRpcProvider, servers, algorithm, hashRingOptions
    }) {
        super(servers, algorithm, hashRingOptions)

        this.contractAddress = contractAddress
        this.jsonRpcProvider = jsonRpcProvider
    }

    async fetchTrackers() {
        const provider = new JsonRpcProvider(this.jsonRpcProvider)
        // check that provider is connected and has some valid blockNumber
        await provider.getBlockNumber()

        const contract = new Contract(this.contractAddress, trackerRegistryConfig.abi, provider)
        // check that contract is connected
        await contract.addressPromise

        if (typeof contract.getNodes !== 'function') {
            throw Error('getNodes is not defined in contract')
        }

        const result = await contract.getNodes()
        result.forEach((tracker) => {
            this.add(tracker.url)
        })
    }

    getTracker(streamKey) {
        return this.get(streamKey)
    }

    getAllTrackers() {
        return Object.keys(this.vnodes)
    }
}

// algorithm is from https://nodejs.org/api/crypto.html or by `openssl list -digest-algorithms`
const getTrackerRegistry = async ({
    contractAddress, jsonRpcProvider, servers, algorithm = 'sha256', hashRingOptions
}) => {
    const trackerRegistry = new TrackerRegistry({
        contractAddress, jsonRpcProvider, servers, algorithm, hashRingOptions
    })
    await trackerRegistry.fetchTrackers()
    return trackerRegistry
}

export {
    TrackerRegistry,
    getTrackerRegistry
}
