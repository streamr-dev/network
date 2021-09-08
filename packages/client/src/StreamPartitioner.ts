/**
 * Derive partitions for StreamMessages.
 */
import { Utils } from 'streamr-client-protocol'
import { CacheFn } from './utils'
import { Config, CacheConfig } from './Config'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamEndpointsCached } from './StreamEndpointsCached'

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
        this.computePartitionCached.clear()
    }

    protected computePartitionCached = CacheFn(Utils.keyToArrayIndex, {
        ...this.cacheOptions,
        cacheKey([partitionCount, partitionKey]) {
            return `${partitionCount}-${partitionKey}`
        }
    })

    protected computeStreamPartition(partitionCount: number, partitionKey: string | number) {
        if (!(Number.isSafeInteger(partitionCount) && partitionCount > 0)) {
            throw new Error(`partitionCount is not a safe positive integer! ${partitionCount}`)
        }

        if (partitionKey == null) {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }

        return this.computePartitionCached(partitionCount, partitionKey)
    }
}
