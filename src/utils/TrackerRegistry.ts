import { Contract, providers } from 'ethers'
import { ConnectionInfo } from 'ethers/lib/utils'

import * as trackerRegistryConfig from '../../contracts/TrackerRegistry.json'

const { JsonRpcProvider } = providers

export type SmartContractRecord = {
    http: string
    ws: string
}

export type TrackerInfo = SmartContractRecord | string

// source: https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
function hashCode(str: string) {
    // eslint-disable-next-line no-bitwise
    const a = str.split('').reduce((prevHash, currVal) => (((prevHash << 5) - prevHash) + currVal.charCodeAt(0)) | 0, 0)
    return Math.abs(a)
}

export class TrackerRegistry<T extends TrackerInfo> {
    private readonly records: T[]

    constructor(records: T[]) {
        this.records = records
        this.records.sort()  // TODO does this actually sort anything?
    }

    getTracker(streamId: string, partition = 0) {
        if (typeof streamId !== 'string' || streamId.indexOf('::') >= 0) {
            throw new Error(`invalid id: ${streamId}`)
        }
        if (!Number.isInteger(partition) || partition < 0) {
            throw new Error(`invalid partition: ${partition}`)
        }

        const streamKey = `${streamId}::${partition}`

        return this.records[hashCode(streamKey) % this.records.length]
    }

    getAllTrackers() {
        return this.records
    }
}

async function fetchTrackers(contractAddress: string, jsonRpcProvider: string | ConnectionInfo) {
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
    return result.map((tracker: any) => tracker.url)
}

export function createTrackerRegistry<T extends TrackerInfo>(servers: T[]) {
    return new TrackerRegistry(servers)
}

export async function getTrackerRegistryFromContract({
    contractAddress,
    jsonRpcProvider
}: {
    contractAddress: string,
    jsonRpcProvider: string | ConnectionInfo
}) {
    const trackers = await fetchTrackers(contractAddress, jsonRpcProvider)
    const records: SmartContractRecord[] = []
    for (let i = 0; i < trackers.length; ++i) {
        try {
            records.push(JSON.parse(trackers[i]))
        } catch (e) {
            throw new Error(`Element trackers[${i}] not parsable as object: ${trackers[i]}`)
        }
    }
    return createTrackerRegistry(records)
}
