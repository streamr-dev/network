import { StreamID, toStreamID, StreamIDUtils } from './StreamID'
import { MAX_PARTITION_COUNT, ensureValidStreamPartitionCount, ensureValidStreamPartitionIndex } from './partition'
import { StreamPartID, toStreamPartID, StreamPartIDUtils } from './StreamPartID'

export {
    toStreamID,
    toStreamPartID,
    StreamID,
    StreamIDUtils,
    StreamPartID,
    StreamPartIDUtils,
    ensureValidStreamPartitionCount,
    ensureValidStreamPartitionIndex,
    MAX_PARTITION_COUNT
}
