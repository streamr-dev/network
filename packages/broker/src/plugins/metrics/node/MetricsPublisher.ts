import { StreamrClient } from 'streamr-client'
import { EthereumAddress } from 'streamr-client-protocol'
import { Logger } from 'streamr-network'
import { PERIOD_LENGTHS, Sample } from './Sample'

export const STREAM_ID_SUFFIXES = {
    [PERIOD_LENGTHS.FIVE_SECONDS]: 'sec',
    [PERIOD_LENGTHS.ONE_MINUTE]: 'min',
    [PERIOD_LENGTHS.ONE_HOUR]: 'hour',
    [PERIOD_LENGTHS.ONE_DAY]: 'day'
}

const logger = new Logger(module)

export class MetricsPublisher {

    private readonly nodeId: EthereumAddress
    private readonly client: StreamrClient
    private readonly streamIdPrefix: string

    constructor(nodeId: string, client: StreamrClient, streamIdPrefix: string) {
        this.nodeId = nodeId
        this.client = client
        this.streamIdPrefix = streamIdPrefix
    }

    async publish(sample: Sample): Promise<void> {
        const periodLength = sample.period.end - sample.period.start
        const streamId = this.getStreamId(periodLength)
        const partitionKey = this.nodeId.toLowerCase()
        try {
            await this.client.publish(streamId, sample, undefined, partitionKey)
        } catch (e: any) {
            logger.warn(`Unable to publish NodeMetrics: ${e.message}`)
        }
    }

    getStreamId(periodLength: number): string {
        const suffix = STREAM_ID_SUFFIXES[periodLength]
        if (suffix !== undefined) {
            return `${this.streamIdPrefix}${suffix}`
        } else {
            throw new Error(`Invalid period length: ${periodLength}`)
        }
    }
}
