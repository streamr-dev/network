import { DEFAULT_PARTITION_COUNT, ensureValidStreamPartitionCount } from '@streamr/utils'
import { StreamrClientError } from './StreamrClientError'

export type StreamMetadata = Record<string, unknown>

export const parseMetadata = (metadata: string): StreamMetadata => {
    // TODO we could pick the fields of StreamMetadata explicitly, so that this
    // object can't contain extra fields
    if (metadata === '') {
        return {
            partitions: DEFAULT_PARTITION_COUNT
        }
    }
    const err = new StreamrClientError(`Invalid stream metadata: ${metadata}`, 'INVALID_STREAM_METADATA')
    let json
    try {
        json = JSON.parse(metadata)
    } catch (_ignored) {
        throw err
    }
    if (json.partitions !== undefined) {
        try {
            // TODO either this validator or the validator is getPartitionCount() is redundant
            // as all metadata JSONs procesed by getPartitionCount() are parsed via this
            // this method
            // see https://github.com/streamr-dev/network/pull/2854
            ensureValidStreamPartitionCount(json.partitions)
            return json
        } catch (_ignored) {
            throw err
        }
    } else {
        return {
            ...json,
            partitions: DEFAULT_PARTITION_COUNT
        }
    }
}

export const getPartitionCount = (metadata: StreamMetadata): number => {
    const metadataValue = metadata.partitions as number | undefined
    if (metadataValue !== undefined) {
        ensureValidStreamPartitionCount(metadataValue)
    }
    return metadataValue ?? DEFAULT_PARTITION_COUNT
}
