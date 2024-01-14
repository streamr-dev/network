import { StreamID, StreamPartIDUtils } from '@streamr/protocol'
import { LoggerFactory } from './LoggerFactory'
import { Message } from '../Message'

export async function waitForAssignmentsToPropagate(
    messages: AsyncIterable<Message>,
    targetStream: {
        id: StreamID
        partitions: number
    },
    loggerFactory: LoggerFactory
): Promise<void> {
    const foundPartitions = new Set<number>
    for await (const msg of messages) {
        const streamPart = (msg.content as any).streamPart
        try {
            const streamPartId = StreamPartIDUtils.parse(streamPart)
            const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
            if ((streamId === targetStream.id) && (partition < targetStream.partitions)) {
                foundPartitions.add(partition)
                if (foundPartitions.size === targetStream.partitions) {
                    return
                }
            }
        } catch {
            loggerFactory.createLogger(module).debug('Ignore malformed content')
        }
    }
}
