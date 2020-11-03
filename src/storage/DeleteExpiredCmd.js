const cassandra = require('cassandra-driver')
const fetch = require('node-fetch')
const pLimit = require('p-limit')

const logger = require('../helpers/logger')('streamr:DeleteExpiredCmd')

const totalSizeOfBuckets = (buckets) => buckets.reduce((mem, { size }) => mem + size, 0) / (1024 * 1024)

const totalNumOfRecords = (buckets) => buckets.reduce((mem, { records }) => mem + records, 0)

class DeleteExpiredCmd {
    constructor({
        streamrBaseUrl,
        cassandraUsername,
        cassandraPassword,
        cassandraHosts,
        cassandraDatacenter,
        cassandraKeyspace,
                    bucketLimit,
        dryRun = true
    }) {
        this.streamrBaseUrl = streamrBaseUrl
        this.dryRun = dryRun
        this.bucketLimit = bucketLimit || 10000000

        const authProvider = new cassandra.auth.PlainTextAuthProvider(cassandraUsername, cassandraPassword)
        this.cassandraClient = new cassandra.Client({
            contactPoints: [...cassandraHosts],
            localDataCenter: cassandraDatacenter,
            keyspace: cassandraKeyspace,
            authProvider,
        })

        // used for limited concurrency
        this.limit = pLimit(5)
    }

    async run() {
        const streams = await this._getStreams()
        logger.info(`Found ${streams.length} unique streams`)

        const streamsInfo = await this._fetchStreamsInfo(streams)
        const potentialBuckets = await this._getPotentiallyExpiredBuckets(streamsInfo)
        logger.info('Found %d potentially expired buckets', potentialBuckets.length)

        const cutPotentialBuckets = potentialBuckets.slice(0, this.bucketLimit)
        logger.info('Left with %d potentially expired buckets fater cutting', cutPotentialBuckets.length)

        const expiredBuckets = await this._filterExpiredBuckets(cutPotentialBuckets)
        logger.info('Found %d expired buckets (total records %d and size %d MB)',
            expiredBuckets.length,
            totalNumOfRecords(expiredBuckets),
            totalSizeOfBuckets(expiredBuckets))

        if (!this.dryRun) {
            await this._deleteExpired(expiredBuckets)
        }

        await this.cassandraClient.shutdown()
    }

    async _getStreams() {
        const query = 'SELECT DISTINCT stream_id, partition FROM bucket'
        const resultSet = await this.cassandraClient.execute(query, [], {
            fetchSize: 100000
        })
        return resultSet.rows.map((row) => ({
            streamId: row.stream_id,
            partition: row.partition
        }))
    }

    async _fetchStreamsInfo(streams) {
        const tasks = streams.filter(Boolean).map((stream) => {
            return this.limit(async () => {
                const url = `${this.streamrBaseUrl}/api/v1/streams/${encodeURIComponent(stream.streamId)}/validation`
                return fetch(url).then((res) => res.json()).then((json) => {
                    return {
                        streamId: stream.streamId,
                        partition: stream.partition,
                        storageDays: json.storageDays != null ? parseInt(json.storageDays) : 365,
                    }
                }).catch((err) => logger.error(err))
            })
        })

        return Promise.all(tasks)
    }

    async _getPotentiallyExpiredBuckets(streamsInfo) {
        const result = []

        const query = 'SELECT * FROM bucket WHERE stream_id = ? AND partition = ? AND date_create <= ?'

        const tasks = streamsInfo.filter(Boolean).map((stream) => {
            const { streamId, partition, storageDays } = stream
            const timestampBefore = Date.now() - 1000 * 60 * 60 * 24 * storageDays
            const params = [streamId, partition, timestampBefore]

            return this.limit(async () => {
                const resultSet = await this.cassandraClient.execute(query, params, {
                    prepare: true,
                }).catch((err) => logger.error(err))

                if (resultSet) {
                    resultSet.rows.forEach((row) => {
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

    async _filterExpiredBuckets(potentialBuckets) {
        const result = []

        const query = 'SELECT MAX(ts) AS m FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id = ?'

        const tasks = potentialBuckets.filter(Boolean).map((bucket) => {
            const { streamId, partition, bucketId, storageDays } = bucket
            const timestampBefore = Date.now() - 1000 * 60 * 60 * 24 * storageDays
            const params = [streamId, partition, bucketId]

            return this.limit(async () => {
                const resultSet = await this.cassandraClient.execute(query, params, {
                    prepare: true,
                }).catch((err) => logger.error(err))

                if (resultSet && (
                    resultSet.rows.length === 0
                    || resultSet.rows[0].m === null
                    || resultSet.rows[0].m.getTime() < timestampBefore)) {
                    result.push(bucket)
                }
            })
        })

        await Promise.all(tasks)
        return result
    }

    async _deleteExpired(expiredBuckets) {
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

            logger.info('Deleting expired bucket [%s, %d, %s]', streamId, partition, bucketId)

            return this.limit(async () => {
                await this.cassandraClient.batch(queries, {
                    prepare: true
                }).catch((err) => logger.error(err))
            })
        })

        return Promise.all(tasks)
    }
}

module.exports = DeleteExpiredCmd
