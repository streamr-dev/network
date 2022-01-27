import { Stream, StreamrClient } from 'streamr-client'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

/**
 * Polls full state of storage node assignments on an interval.
 */
export class StoragePoller {
    private readonly clusterId: string
    private readonly pollInterval: number
    private readonly streamrClient: StreamrClient
    private readonly handleResult: (streams: Stream[], block: number) => void
    private timeoutRef?: NodeJS.Timeout
    private destroyed = false

    constructor(
        clusterId: string,
        pollInterval: number,
        streamrClient: StreamrClient,
        handleResult: (streams: Stream[], block: number) => void
    ) {
        this.clusterId = clusterId
        this.pollInterval = pollInterval
        this.streamrClient = streamrClient
        this.handleResult = handleResult
    }

    async start(): Promise<void> {
        const schedulePoll = async () => {
            if (this.destroyed) { return }

            try {
                await this.poll()
            } catch (err) {
                logger.warn(`error when trying to poll full state: ${err}`)
            }

            if (this.destroyed) { return }

            if (this.pollInterval !== 0) {
                this.timeoutRef = setTimeout(schedulePoll, this.pollInterval)
            } else {
                logger.info('pollInterval=0; will not keep refreshing full state.')
            }
        }
        await schedulePoll()
    }

    async poll(): Promise<void> {
        logger.info('polling...')
        const { streams, blockNumber } = await this.streamrClient.getStoredStreamsOf(this.clusterId)
        logger.info('found %d streams at block %d', streams.length, blockNumber)
        this.handleResult(streams, blockNumber)
    }

    destroy(): void {
        this.destroyed = true
        if (this.timeoutRef !== undefined) {
            clearTimeout(this.timeoutRef)
        }
    }
}
