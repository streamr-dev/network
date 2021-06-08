import crypto from 'crypto'

import { CacheFn } from '../utils'
import type { StreamrClientOptions } from '../Config'

function hash(stringToHash: string) {
    return crypto.createHash('md5').update(stringToHash).digest()
}

export default function StreamPartitioner(cacheOptions: StreamrClientOptions['cache']) {
    const cachedHash = CacheFn(hash, cacheOptions)
    function computeStreamPartition(partitionCount: number, partitionKey: string | number) {
        if (!(Number.isSafeInteger(partitionCount) && partitionCount > 0)) {
            throw new Error(`partitionCount is not a safe positive integer! ${partitionCount}`)
        }

        if (partitionCount === 1) {
            // Fast common case
            return 0
        }

        if (typeof partitionKey === 'number') {
            return Math.abs(partitionKey) % partitionCount
        }

        if (!partitionKey) {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }

        const buffer = cachedHash(partitionKey)
        const intHash = buffer.readInt32LE()
        return Math.abs(intHash) % partitionCount
    }

    computeStreamPartition.clear = cachedHash.clear
    return computeStreamPartition
}

