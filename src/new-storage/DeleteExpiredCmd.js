const cassandra = require('cassandra-driver')
const fetch = require('node-fetch')
const pLimit = require('p-limit')

const validateConfig = require('../helpers/validateConfig')

class DeleteExpiredCmd {
    constructor(config) {
        validateConfig(config)

        this.baseUrl = config.streamrUrl

        const authProvider = new cassandra.auth.PlainTextAuthProvider(config.cassandraNew.username, config.cassandraNew.password)
        this.cassandraClient = new cassandra.Client({
            contactPoints: [...config.cassandraNew.hosts],
            localDataCenter: config.cassandraNew.datacenter,
            keyspace: config.cassandraNew.keyspace,
            authProvider,
            pooling: {
                maxRequestsPerConnection: 32768
            }
        })

        // used for limited concurrency
        this.limit = pLimit(5)
    }

    async _getStreams() {
        const result = []

        const query = 'SELECT DISTINCT stream_id, partition FROM bucket'
        const resultSet = await this.cassandraClient.execute(query).catch((err) => console.error(err))

        if (resultSet) {
            resultSet.rows.forEach((row) => {
                result.push({
                    streamId: row.stream_id,
                    partition: row.partition
                })
            })
        }

        return result
    }

    async _fetchStreamsInfo(streams) {
        const tasks = streams.filter(Boolean).map((stream) => {
            return this.limit(async () => {
                const url = `${this.baseUrl}/api/v1/streams/${stream.streamId}/validation`
                return fetch(url).then((res) => res.json()).then((json) => {
                    return {
                        streamId: stream.streamId,
                        partition: stream.partition,
                        storageDays: parseInt(json.storageDays)
                    }
                }).catch((err) => console.error(err))
            })
        })

        return Promise.all(tasks)
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

            return this.limit(async () => {
                await this.cassandraClient.batch(queries, {
                    prepare: true
                }).catch((err) => console.error(err))
            })
        })

        return Promise.all(tasks)
    }

    async _getExpiredBuckets(streamsInfo) {
        const result = []

        const query = 'SELECT * FROM bucket WHERE stream_id = ? AND partition = ? AND date_create <= ?'

        const tasks = streamsInfo.filter(Boolean).map((stream) => {
            const { streamId, partition, storageDays } = stream
            const timestampBefore = Date.now() - 1000 * 60 * 60 * 24 * storageDays
            const params = [streamId, partition, timestampBefore]

            return this.limit(async () => {
                const resultSet = await this.cassandraClient.execute(query, params, {
                    prepare: true,
                }).catch((err) => console.error(err))

                if (resultSet) {
                    resultSet.rows.forEach((row) => {
                        result.push({
                            bucketId: row.id,
                            dateCreate: row.date_create,
                            streamId: row.stream_id,
                            partition: row.partition,
                            storageDays
                        })
                    })
                }
            })
        })

        await Promise.all(tasks)
        return result
    }

    async run() {
        const streams = await this._getStreams()
        console.info(`Found ${streams.length} unique streams`)

        const streamsInfo = await this._fetchStreamsInfo(streams)
        const expiredBuckets = await this._getExpiredBuckets(streamsInfo)

        console.info(`Found ${expiredBuckets.length} expired buckets`)
        await this._deleteExpired(expiredBuckets)

        await this.cassandraClient.shutdown()
    }
}

module.exports = DeleteExpiredCmd
