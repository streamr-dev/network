import { Logger, Multimap } from '@streamr/utils'
import { MaintainTopologyHelper } from './MaintainTopologyHelper'
import StreamrClient, { Stream, Subscription } from 'streamr-client'
import { StreamID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { SetMembershipSynchronizer } from '../storage/SetMembershipSynchronizer'
import pLimit from 'p-limit'

function toStreamIDSafe(input: string): StreamID | undefined {
    try {
        return toStreamID(input)
    } catch {
        return undefined
    }
}

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly maintainTopologyHelper: MaintainTopologyHelper
    private readonly subscriptions = new Multimap<StreamID, Subscription>()
    private readonly synchronizer = new SetMembershipSynchronizer<StreamID>()
    private readonly concurrencyLimit = pLimit(1)
    private readonly logger: Logger

    constructor(streamrClient: StreamrClient, maintainTopologyHelper: MaintainTopologyHelper, logger: Logger) {
        this.streamrClient = streamrClient
        this.maintainTopologyHelper = maintainTopologyHelper
        this.logger = logger
    }

    async start(): Promise<void> {
        this.logger.info('Starting MaintainTopologyService')
        this.maintainTopologyHelper.on('addStakedStream', this.onAddStakedStreams)
        this.maintainTopologyHelper.on('removeStakedStream', this.onRemoveStakedStream)
        await this.maintainTopologyHelper.start()
        this.logger.info('Started MaintainTopologyService')
    }

    async stop(): Promise<void> {
        this.maintainTopologyHelper.stop()
        this.logger.info('stopped')
    }

    private onAddStakedStreams = async (streamIDs: string[]) => {
        streamIDs.map(this.parseStreamIdWrapper(this.addStream.bind(this)))
    }

    private onRemoveStakedStream = this.parseStreamIdWrapper(async (streamId: StreamID) => {
        const subscriptions = this.subscriptions.get(streamId)
        this.subscriptions.removeAll(streamId, subscriptions)
        await Promise.all(subscriptions.map((sub) => sub.unsubscribe())) // TODO: rejects?
    })

    private async addStream(streamId: StreamID): Promise<void> {
        let stream: Stream
        try {
            stream = await this.streamrClient.getStream(streamId)
        } catch (err) {
            this.logger.warn('Ignore non-existing stream', { streamId, reason: err?.message })
            return
        }
        for (const streamPart of stream.getStreamParts()) {
            const id = StreamPartIDUtils.getStreamID(streamPart)
            const partition = StreamPartIDUtils.getStreamPartition(streamPart)
            const subscription = await this.streamrClient.subscribe({
                id,
                partition,
                raw: true
            }) // TODO: rejects?
            this.subscriptions.add(id, subscription)
        }
    }

    private parseStreamIdWrapper(
        fn: (streamId: StreamID) => Promise<void>
    ): (streamIdAsStr: string) => void {
        return (streamIdAsStr: string) => {
            const streamId = toStreamIDSafe(streamIdAsStr)
            if (streamId !== undefined) {
                this.concurrencyLimit(() => fn(streamId))
            } else {
                this.logger.error('Encountered invalid stream id', { streamIdAsStr })
            }
        }
    }
}
