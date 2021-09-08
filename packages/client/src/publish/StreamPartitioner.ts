import { CacheFn } from '../utils'
import type { StreamrClientOptions } from '../Config'
import { Utils } from 'streamr-client-protocol'

function computePartition(partitionCount: number, partitionKey: string) {
    return Utils.keyToArrayIndex(partitionCount, partitionKey)
}

export default function StreamPartitioner(cacheOptions: StreamrClientOptions['cache']) {
    const cachedPartition = CacheFn(computePartition, cacheOptions)
    function computeStreamPartition(partitionCount: number, partitionKey: string | number) {
        if (!(Number.isSafeInteger(partitionCount) && partitionCount > 0)) {
            throw new Error(`partitionCount is not a safe positive integer! ${partitionCount}`)
        }

        if (partitionKey == null) {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }

        return cachedPartition(partitionCount, partitionKey)
    }

    computeStreamPartition.clear = cachedPartition.clear
    return computeStreamPartition
}

