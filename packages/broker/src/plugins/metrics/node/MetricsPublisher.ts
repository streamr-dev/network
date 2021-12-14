import { StreamOperation, StreamrClient } from 'streamr-client'
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

    private readonly nodeAddress: string
    private readonly client: StreamrClient
    private readonly storageNodeAddress: string

    constructor(nodeAddress: string, client: StreamrClient, storageNodeAddress: string) {
        this.nodeAddress = nodeAddress
        this.client = client
        this.storageNodeAddress = storageNodeAddress
    }

    async publish(sample: Sample): Promise<void> {
        const periodLength = sample.period.end - sample.period.start
        const streamId = this.getStreamId(periodLength)
        try {
            await this.client.publish(streamId, sample)
        } catch (e: any) {
            logger.warn(`Unable to publish NodeMetrics: ${e.message}`)
        }
    }

    async ensureStreamsCreated(): Promise<void> {
        await Promise.all(
            Object.keys(STREAM_ID_SUFFIXES)
                .map((periodLengthAsString: string) => this.ensureStreamCreated(Number(periodLengthAsString)))
        )
    }

    private async ensureStreamCreated(periodLength: number): Promise<string> {
        const streamId = this.getStreamId(periodLength)
        const stream = await this.client.getOrCreateStream({
            id: streamId
        })
        await stream.grantPermission('stream_get' as StreamOperation, undefined)
        await stream.grantPermission('stream_subscribe' as StreamOperation, undefined)
        if (periodLength !== PERIOD_LENGTHS.FIVE_SECONDS) {
            try {
                await stream.addToStorageNode(this.storageNodeAddress)
            } catch (err: any) {
                logger.warn('Unable to add %s to storage node, reason: %s', streamId, err.message)
            }
        }
        return stream.id
    }

    /**
     * Fetch the sample from the previous Broker session.
     *
     * E.g. if Broker was running at 01:23:00-03:45:59, it generated
     * - 'hour' reports of 01 and 02
     * - 'min' reports for 01:23-03:44
     * - many 'sec' reports
     *
     * We'll fetch all 'hour' reports, and all 'min' reports which have not yet been
     * aggerated to 'hour' reports. All 'sec' reports are ignored.
     *
     * With this data we are able to generate the correct 'day' report at midnight
     * as it will include the 'hour' data for both this run and the previous run.
     * The aggregator will also generate the missing 'hour' report from the 'min' samples.
     *
     * This same logic applies also if the previous Broker run was before the current date.
     * In that case the missing 'hour' and 'day' reports are  aggregated and published,
     * but they don't affect to the current 'day' sample.
     */
    async fetchExistingSamples(): Promise<{ minutes: Sample[], hours: Sample[] }> {
        try {
            const MAX_HOUR_COUNT = 24
            const MAX_MINUTE_COUNT = 60
            const days: Sample[] = await this.getHistoricalSamples(PERIOD_LENGTHS.ONE_DAY, 1)
            const hours: Sample[] = await this.getHistoricalSamples(PERIOD_LENGTHS.ONE_HOUR, MAX_HOUR_COUNT)
            const minutes: Sample[] = await this.getHistoricalSamples(PERIOD_LENGTHS.ONE_MINUTE, MAX_MINUTE_COUNT)
            const getLatestTimestamp = (historicalSamples: Sample[]) => {
                if (historicalSamples.length > 0) {
                    const lastItem = historicalSamples[historicalSamples.length - 1]
                    return lastItem.period.end
                } else {
                    return undefined
                }
            }
            const getNonAggregatedSamples = (samples: Sample[], latestParentTimestamp?: number) => {
                if (latestParentTimestamp !== undefined) {
                    return samples.filter((sample) => sample.period.end > latestParentTimestamp)
                } else {
                    return samples
                }
            }
            return {
                minutes: getNonAggregatedSamples(minutes, getLatestTimestamp(hours)),
                hours: getNonAggregatedSamples(hours, getLatestTimestamp(days))
            }
        } catch (e) {
            logger.warn('Unable to fetch initial data for NodeMetrics')
            return {
                minutes: [],
                hours: []
            }
        }
    }

    // TODO simplify error handling?
    private async getHistoricalSamples(
        periodLength: number,
        last: number,
        timeout = 10 * 1000
    ): Promise<Sample[]> {
        return new Promise(async (resolve, reject) => {
            let isTimedOut = false
            let sub
            function startTimeout() {
                return setTimeout(() => {
                    isTimedOut = true
                    reject(new Error('StreamMetrics timed out'))
                }, timeout)
            }

            let timeoutId = startTimeout()
            const messages: Sample[] = []
            try {
                sub = await this.client.resend<Sample>({
                    stream: this.getStreamId(periodLength),
                    resend: {
                        last
                    }
                }, (message) => {
                    clearTimeout(timeoutId)
                    timeoutId = startTimeout()
                    messages.push(message)
                })

                if (isTimedOut) {
                    resolve([])
                    return
                }

                await sub.consume()

                // currently there can be previous data from the previous PerNodeMetrics implementation,
                // -> filter those out
                // TODO remove this filter soon
                resolve(messages.filter((m) => m.period !== undefined && m.period.start !== undefined && m.period.end !== undefined))
            } catch (err) {
                reject(err)
            } finally {
                clearTimeout(timeoutId)
                if (sub) {
                    sub.return()
                }
            }
        })
    }

    getStreamId(periodLength: number): string {
        const suffix = STREAM_ID_SUFFIXES[periodLength]
        if (suffix !== undefined) {
            return `${this.nodeAddress.toLowerCase()}/streamr/node/metrics/${suffix}`
        } else {
            throw new Error(`Invalid period length: ${periodLength}`)
        }
    }

    async stop(): Promise<void> {
    }
}
