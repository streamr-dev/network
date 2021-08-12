import crypto from 'crypto'

import { CacheFn } from './utils'
import { Config, CacheConfig } from './Config'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamEndpointsCached } from './StreamEndpointsCached'

function hash(stringToHash: string) {
    return crypto.createHash('md5').update(stringToHash).digest()
}

export type PartitionKey = string | number

@scoped(Lifecycle.ContainerScoped)
export default class StreamPartitioner {
    constructor(
        private streamEndpoints: StreamEndpointsCached,
        @inject(Config.Cache) private cacheOptions: CacheConfig,
    ) {}

    public async compute(streamId: string, partitionKey: PartitionKey) {
        const stream = await this.streamEndpoints.getStream(streamId)
        return this.computeStreamPartition(stream.partitions, partitionKey)
    }

    public clear() {
        this.hash.clear()
    }

    protected hash = CacheFn(hash, this.cacheOptions)
    protected computeStreamPartition(partitionCount: number, partitionKey: PartitionKey) {
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

        const buffer = this.hash(partitionKey)
        const intHash = buffer.readInt32LE()
        return Math.abs(intHash) % partitionCount
    }
}
