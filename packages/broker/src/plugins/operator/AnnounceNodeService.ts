import { EthereumAddress, Logger, setAbortableInterval } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'
import { StreamID, toStreamID } from '@streamr/protocol'

const logger = new Logger(module)

const DEFAULT_INTERVAL_IN_MS = 1000 * 10

export class AnnounceNodeService {
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
        const nodeId = (await this.streamrClient.getNode()).getNodeId()
        setAbortableInterval(() => {
            this.streamrClient.publish(this.coordinationStream, {
                msgType: 'heartbeat',
                nodeId
            }).catch((err) => {
                logger.warn('Unable to publish to coordination stream', {
                    streamId: this.coordinationStream,
                    reason: err?.message
                })
            })
        }, this.intervalInMs, this.abortController.signal)
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
