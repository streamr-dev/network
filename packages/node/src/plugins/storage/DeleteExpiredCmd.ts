import cassandra, { Client } from 'cassandra-driver'
import pLimit, { Limit } from 'p-limit'
import { StreamrClient } from '@streamr/sdk'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

const totalSizeOfBuckets = (buckets: BucketInfo[]) => buckets.reduce((mem, { size }) => mem + size, 0) / (1024 * 1024)

const totalRecordCount = (buckets: BucketInfo[]) => buckets.reduce((mem, { records }) => mem + records, 0)

interface StreamPart {
    streamId: string
    partition: number
}

interface StreamPartInfo extends StreamPart {
    storageDays: number
}

interface BucketInfo {
    bucketId: string
    dateCreate: number
    streamId: string
    partition: number
    records: number
    size: number
    storageDays: number
}

interface Options {
    streamrBaseUrl: string
    cassandraUsername: string
    cassandraPassword: string
    cassandraHosts: string[]
    cassandraDatacenter: string
    cassandraKeyspace: string
    bucketLimit?: number
    dryRun?: boolean
}

export class DeleteExpiredCmd {
    streamrBaseUrl: string
    dryRun: boolean
    bucketLimit: number
    cassandraClient: Client
    limit: Limit

    constructor({
        streamrBaseUrl,
        cassandraUsername,
        cassandraPassword,
        cassandraHosts,
        cassandraDatacenter,
        cassandraKeyspace,
        bucketLimit,
        dryRun = true
    }: Options) {
        this.streamrBaseUrl = streamrBaseUrl
        this.dryRun = dryRun
        this.bucketLimit = bucketLimit ?? 10000000

        const authProvider = new cassandra.auth.PlainTextAuthProvider(cassandraUsername, cassandraPassword)
        this.cassandraClient = new cassandra.Client({
            contactPoints: [...cassandraHosts],
            localDataCenter: cassandraDatacenter,
            keyspace: cassandraKeyspace,
            authProvider
        })

        // used for limited concurrency
        this.limit = pLimit(5)
    }

    async run(client: StreamrClient): Promise<void> {
        const streams = await this.getStreams()
        logger.info(`Found ${streams.length} unique streams`)

        const streamsInfo = await this.fetchStreamsInfo(streams, client)
        const potentialBuckets = await this.getPotentiallyExpiredBuckets(streamsInfo)
        logger.info(`Found ${potentialBuckets.length} potentially expired buckets`)

        const cutPotentialBuckets = potentialBuckets.slice(0, this.bucketLimit)
        logger.info(`Left with ${cutPotentialBuckets.length} potentially expired buckets after cutting`)

        const expiredBuckets = await this.filterExpiredBuckets(cutPotentialBuckets)
        logger.info(`Found ${expiredBuckets.length} expired buckets`, {
            totalRecords: totalRecordCount(expiredBuckets),
            totalSizeOfBucketsInMb: totalSizeOfBuckets(expiredBuckets)
        })

        if (!this.dryRun) {
            await this.deleteExpired(expiredBuckets)
        }

        await this.cassandraClient.shutdown()
    }

    private async getStreams(): Promise<StreamPart[]> {
        const query = 'SELECT DISTINCT stream_id, partition FROM bucket'
        const resultSet = await this.cassandraClient.execute(query, [], {
            fetchSize: 100000
        })
        return resultSet.rows.map((row) => ({
            streamId: row.stream_id,
            partition: row.partition
        }))
    }

    private async fetchStreamsInfo(
        streams: StreamPart[],
        client: StreamrClient
    ): Promise<(StreamPartInfo | undefined)[]> {
        const tasks = streams.filter(Boolean).map((stream: StreamPart) => {
            return this.limit(async () => {
                try {
                    const streamFromChain = await client.getStream(stream.streamId)
                    return {
                        streamId: stream.streamId,
                        partition: stream.partition,
                        storageDays: (await streamFromChain.getStorageDayCount()) ?? 365
                    }
                } catch (err) {
                    logger.error('Failed to fetch stream info', { err })
                }
            })
        })

        return Promise.all(tasks)
    }

    private async getPotentiallyExpiredBuckets(streamsInfo: (StreamPartInfo | undefined)[]): Promise<BucketInfo[]> {
        const result: BucketInfo[] = []

        const query = 'SELECT * FROM bucket WHERE stream_id = ? AND partition = ? AND date_create <= ?'

        // @ts-expect-error void filtering
        const tasks = streamsInfo.filter(Boolean).map((stream: StreamPartInfo) => {
            const { streamId, partition, storageDays } = stream
            const timestampBefore = Date.now() - 1000 * 60 * 60 * 24 * storageDays
            const params = [streamId, partition, timestampBefore]

            return this.limit(async () => {
                const resultSet = await this.cassandraClient
                    .execute(query, params, {
                        prepare: true
                    })
                    .catch((err) => logger.error('Failed to execute query', { err, query }))

                if (resultSet) {
                    resultSet.rows.forEach((row: cassandra.types.Row) => {
                        result.push({
                            bucketId: row.id,
                            dateCreate: row.date_create,
                            streamId: row.stream_id,
                            partition: row.partition,
                            records: row.records,
                            size: row.size,
                            storageDays
                        })
                    })
                }
            })
        })

        await Promise.all(tasks)
        return result
    }

    private async filterExpiredBuckets(potentialBuckets: BucketInfo[]): Promise<BucketInfo[]> {
        const result: BucketInfo[] = []

        const query = 'SELECT MAX(ts) AS m FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id = ?'

        const tasks = potentialBuckets.filter(Boolean).map((bucket: BucketInfo) => {
            const { streamId, partition, bucketId, storageDays } = bucket
            const timestampBefore = Date.now() - 1000 * 60 * 60 * 24 * storageDays
            const params = [streamId, partition, bucketId]

            return this.limit(async () => {
                const resultSet = await this.cassandraClient
                    .execute(query, params, {
                        prepare: true
                    })
                    .catch((err) => logger.error('Failed to execute query', { err, query }))

                if (
                    resultSet &&
                    (resultSet.rows.length === 0 ||
                        resultSet.rows[0].m === null ||
                        resultSet.rows[0].m.getTime() < timestampBefore)
                ) {
                    result.push(bucket)
                }
            })
        })

        await Promise.all(tasks)
        return result
    }

    private async deleteExpired(expiredBuckets: BucketInfo[]): Promise<undefined[]> {
        const tasks = expiredBuckets.filter(Boolean).map((stream) => {
            const { bucketId, dateCreate, streamId, partition } = stream
            const queries = [
                {
                    query: 'DELETE FROM bucket WHERE stream_id = ? AND partition = ? AND date_create = ?',
                    params: [streamId, partition, dateCreate]
                },
                {
                    query: 'DELETE FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id = ?',
                    params: [streamId, partition, bucketId]
                }
            ]

            logger.info('Delete expired bucket', { streamId, partition, bucketId })

            return this.limit(async () => {
                await this.cassandraClient
                    .batch(queries, {
                        prepare: true
                    })
                    .catch((err) => logger.error('Failed to delete expired buckets', { err, queries }))
                return undefined
            })
        })

        return Promise.all(tasks)
    }
}
