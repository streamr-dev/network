import { DEFAULT_PARTITION_COUNT, ensureValidStreamPartitionCount } from '@streamr/utils'
import { StreamrClientError } from './StreamrClientError'

export type StreamMetadata = Record<string, unknown>

export const parseMetadata = (metadata: string): StreamMetadata => {
    try {
        return JSON.parse(metadata)
    } catch (_ignored) {
        return {}
    }
}

export const getPartitionCount = (metadata: StreamMetadata): number => {
    const metadataValue = metadata.partitions as number | undefined
    if (metadataValue !== undefined) {
        try {
            ensureValidStreamPartitionCount(metadataValue)
        } catch {
            throw new StreamrClientError(`Invalid partition count: ${metadataValue}`, 'INVALID_STREAM_METADATA')
        }
    }
    return metadataValue ?? DEFAULT_PARTITION_COUNT
}
