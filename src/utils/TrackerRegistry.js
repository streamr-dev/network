import { Contract, providers } from 'ethers'

import * as trackerRegistryConfig from '../../contracts/TrackerRegistry.json'

const { JsonRpcProvider } = providers

// source: https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
function hashCode(str) {
    // eslint-disable-next-line no-bitwise
    const a = str.split('').reduce((prevHash, currVal) => (((prevHash << 5) - prevHash) + currVal.charCodeAt(0)) | 0, 0)
    return Math.abs(a)
}

class TrackerRegistry {
    // TODO: remove default value
    constructor(records = []) {
        this.records = records
    }

    getTracker(streamKey) {
        return this.records[hashCode(streamKey) % this.records.length]
    }

    // TODO: remove soon
    add(tracker) {
        this.records.push(tracker)
        this.records.sort()
    }

    // TODO: remove soon
    get(streamKey) {
        return this.getTracker(streamKey)
    }

    getAllTrackers() {
        return this.records
    }
}

async function fetchTrackers(contractAddress, jsonRpcProvider) {
    const provider = new JsonRpcProvider(jsonRpcProvider)
    // check that provider is connected and has some valid blockNumber
    await provider.getBlockNumber()

    const contract = new Contract(contractAddress, trackerRegistryConfig.abi, provider)
    // check that contract is connected
    await contract.addressPromise

    if (typeof contract.getNodes !== 'function') {
        throw Error(`getNodes function is not defined in smart contract (${contractAddress})`)
    }

    const result = await contract.getNodes()
    return result.map((tracker) => tracker.url)
}

function createTrackerRegistry(servers) {
    return new TrackerRegistry(servers)
}

async function getTrackerRegistryFromContract({ contractAddress, jsonRpcProvider }) {
    const trackers = await fetchTrackers(contractAddress, jsonRpcProvider)
    const records = []
    for (let i = 0; i < trackers.length; ++i) {
        try {
            records.push(JSON.parse(trackers[i]))
        } catch (e) {
            throw new Error(`Element trackers[${i}] not parsable as object: ${trackers[i]}`)
        }
    }
    return createTrackerRegistry(records)
}

export {
    createTrackerRegistry,
    getTrackerRegistryFromContract,
}
