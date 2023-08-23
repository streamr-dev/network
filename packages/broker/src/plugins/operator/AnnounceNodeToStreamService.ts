import { EthereumAddress, Logger, setAbortableInterval } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'
import { StreamID, toStreamID } from '@streamr/protocol'

const logger = new Logger(module)

export const DEFAULT_INTERVAL_IN_MS = 1000 * 10

export class AnnounceNodeToStreamService {
    private readonly abortController = new AbortController()
    private readonly streamrClient: StreamrClient
    private readonly coordinationStream: StreamID
    private readonly intervalInMs: number

    constructor(
        streamrClient: StreamrClient,
        operatorContractAddress: EthereumAddress,
        intervalInMs = DEFAULT_INTERVAL_IN_MS
    ) {
        this.streamrClient = streamrClient
        this.coordinationStream = toStreamID('/operator/coordination', operatorContractAddress)
        this.intervalInMs = intervalInMs
    }

    async start(): Promise<void> {
        setAbortableInterval(() => {
            (async () => {
                try {
                    const peerDescriptor = await this.streamrClient.getPeerDescriptor()
                    await this.streamrClient.publish(this.coordinationStream, {
                        msgType: 'heartbeat',
                        peerDescriptor
                    })
                } catch (err) {
                    logger.warn('Unable to publish to coordination stream', {
                        streamId: this.coordinationStream,
                        reason: err?.message
                    })
                }
            })()
        }, this.intervalInMs, this.abortController.signal)
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
