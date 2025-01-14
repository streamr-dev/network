import { Client, types as cassandraTypes } from 'cassandra-driver'
import Heap from 'heap'
import { Logger, merge } from '@streamr/utils'
import { Bucket, BucketId } from './Bucket'

const { TimeUuid } = cassandraTypes

const logger = new Logger(module)

type StreamPartKey = string

interface StreamPartState {
    streamId: string
    partition: number
    buckets: Heap<Bucket>
    minTimestamp?: number
}

export interface BucketManagerOptions {
    checkFullBucketsTimeout: number
    storeBucketsTimeout: number
    maxBucketSize: number
    maxBucketRecords: number
    bucketKeepAliveSeconds: number
}

const toKey = (streamId: string, partition: number): StreamPartKey => `${streamId}-${partition}`

const instantiateNewHeap = () =>
    new Heap((a: Bucket, b: Bucket) => {
        // @ts-expect-error TODO is dateCreate a Date object or a number?
        return b.dateCreate - a.dateCreate
    })

export class BucketManager {
    opts: BucketManagerOptions
    streamParts: Record<StreamPartKey, StreamPartState>
    buckets: Record<BucketId, Bucket>
    cassandraClient: Client
    private checkFullBucketsTimeout?: NodeJS.Timeout
    private storeBucketsTimeout?: NodeJS.Timeout

    constructor(cassandraClient: Client, opts: Partial<BucketManagerOptions> = {}) {
        const defaultOptions = {
            checkFullBucketsTimeout: 1000,
            storeBucketsTimeout: 500,
            maxBucketSize: 1024 * 1024 * 100,
            maxBucketRecords: 500 * 1000,
            bucketKeepAliveSeconds: 60
        }

        this.opts = merge(defaultOptions, opts)

        this.streamParts = Object.create(null)
        this.buckets = Object.create(null)

        this.cassandraClient = cassandraClient

        this.checkFullBucketsTimeout = undefined
        this.storeBucketsTimeout = undefined

        this.checkFullBuckets()
        this.storeBuckets()
    }

    getBucketId(streamId: string, partition: number, timestamp: number): string | undefined {
        let bucketId

        const key = toKey(streamId, partition)

        if (this.streamParts[key]) {
            logger.trace('Found stream', { key })
            bucketId = this.findBucketId(key, timestamp)

            if (!bucketId) {
                const stream = this.streamParts[key]
                stream.minTimestamp =
                    stream.minTimestamp !== undefined ? Math.min(stream.minTimestamp, timestamp) : timestamp
            }
        } else {
            logger.trace('Create new (stream not found)', { key })

            this.streamParts[key] = {
                streamId,
                partition,
                buckets: instantiateNewHeap(),
                minTimestamp: timestamp
            }
        }

        return bucketId
    }

    incrementBucket(bucketId: BucketId, size: number): void {
        const bucket = this.buckets[bucketId]
        if (bucket) {
            bucket.incrementBucket(size)
        } else {
            logger.warn('Failed to increment bucket (bucket not found)', { bucketId })
        }
    }

    private getLatestInMemoryBucket(key: StreamPartKey): Bucket | undefined {
        const stream = this.streamParts[key]
        if (stream) {
            return stream.buckets.peek()
        }
        return undefined
    }

    private findBucketId(key: StreamPartKey, timestamp: number): string | undefined {
        let bucketId
        logger.trace('Check stream in state', {
            key,
            timestamp
        })

        const stream = this.streamParts[key]
        if (stream) {
            const latestBucket = this.getLatestInMemoryBucket(key)

            if (latestBucket) {
                // latest bucket is younger than timestamp
                if (!latestBucket.isAlmostFull() && latestBucket.dateCreate <= new Date(timestamp)) {
                    bucketId = latestBucket.getId()
                    // timestamp is in the past
                } else if (latestBucket.dateCreate > new Date(timestamp)) {
                    const currentBuckets = stream.buckets.toArray()
                    // remove latest
                    currentBuckets.shift()

                    for (const currentBucket of currentBuckets) {
                        if (currentBucket.dateCreate <= new Date(timestamp)) {
                            bucketId = currentBucket.getId()
                            break
                        }
                    }
                }
            }
        }
        return bucketId
    }

    private async checkFullBuckets(): Promise<void> {
        const streamIds = Object.keys(this.streamParts)

        for (const streamIdKey of streamIds) {
            const stream = this.streamParts[streamIdKey]
            const { streamId, partition } = stream
            const { minTimestamp } = stream

            // minTimestamp is undefined if all buckets are found
            if (minTimestamp === undefined) {
                continue
            }

            let insertNewBucket = false

            // helper function
            const checkFoundBuckets = (foundBuckets: Bucket[]) => {
                const foundBucket = foundBuckets.length ? foundBuckets[0] : undefined

                if (foundBucket && !(foundBucket.getId() in this.buckets)) {
                    stream.buckets.push(foundBucket)
                    this.buckets[foundBucket.getId()] = foundBucket
                    stream.minTimestamp = undefined
                } else {
                    insertNewBucket = true
                }
            }

            // check in memory
            const key = toKey(streamId, partition)
            const latestBucket = this.getLatestInMemoryBucket(key)
            if (latestBucket) {
                // if latest is full or almost full - create new bucket
                insertNewBucket = latestBucket.isAlmostFull()
            }

            // if latest is not found or it's full => try to find latest in database
            if (!latestBucket || latestBucket.isAlmostFull()) {
                const foundBuckets = await this.getLastBuckets(streamId, partition, 1)
                checkFoundBuckets(foundBuckets)
            }

            // check in database that we have bucket for minTimestamp
            if (!insertNewBucket && !this.findBucketId(key, minTimestamp)) {
                const foundBuckets = await this.getLastBuckets(streamId, partition, 1, minTimestamp)
                checkFoundBuckets(foundBuckets)
            }

            if (insertNewBucket) {
                logger.trace('Create new bucket (existing bucket for timestamp not found)', { minTimestamp })

                // we create first in memory, so don't wait for database, then _storeBuckets inserts bucket into database
                const newBucket = new Bucket(
                    TimeUuid.fromDate(new Date(minTimestamp)).toString(),
                    streamId,
                    partition,
                    0,
                    0,
                    new Date(minTimestamp),
                    this.opts.maxBucketSize,
                    this.opts.maxBucketRecords,
                    this.opts.bucketKeepAliveSeconds
                )

                stream.buckets.push(newBucket)
                this.buckets[newBucket.getId()] = newBucket
                stream.minTimestamp = undefined
            }
        }
        this.checkFullBucketsTimeout = setTimeout(() => this.checkFullBuckets(), this.opts.checkFullBucketsTimeout)
    }

    /**
     * Get buckets by timestamp range or all known from some timestamp or all buckets before some timestamp
     *
     * @param streamId
     * @param partition
     * @param fromTimestamp
     * @param toTimestamp
     * @returns {Promise<[]>}
     */
    async getBucketsByTimestamp(
        streamId: string,
        partition: number,
        fromTimestamp: number | undefined = undefined,
        toTimestamp: number | undefined = undefined
    ): Promise<Bucket[]> {
        const getExplicitFirst = () => {
            // if fromTimestamp is defined, the first data point are in a some earlier bucket
            // (bucket.dateCreated<=fromTimestamp as data within one millisecond won't be divided to multiple buckets)
            const QUERY =
                'SELECT * FROM bucket WHERE stream_id = ? and partition = ? AND date_create <= ? ORDER BY date_create DESC LIMIT 1'
            const params = [streamId, partition, fromTimestamp]
            return this.getBucketsFromDatabase(QUERY, params, streamId, partition)
        }

        const getRest = () => {
            const GET_LAST_BUCKETS_RANGE_TIMESTAMP =
                'SELECT * FROM bucket WHERE stream_id = ? and partition = ? AND date_create > ? AND date_create <= ? ORDER BY date_create DESC'
            const GET_LAST_BUCKETS_FROM_TIMESTAMP =
                'SELECT * FROM bucket WHERE stream_id = ? and partition = ? AND date_create > ? ORDER BY date_create DESC'
            const GET_LAST_BUCKETS_TO_TIMESTAMP =
                'SELECT * FROM bucket WHERE stream_id = ? and partition = ? AND date_create <= ? ORDER BY date_create DESC'
            let query
            let params
            if (fromTimestamp !== undefined && toTimestamp !== undefined) {
                query = GET_LAST_BUCKETS_RANGE_TIMESTAMP
                params = [streamId, partition, fromTimestamp, toTimestamp]
            } else if (fromTimestamp !== undefined && toTimestamp === undefined) {
                query = GET_LAST_BUCKETS_FROM_TIMESTAMP
                params = [streamId, partition, fromTimestamp]
            } else if (fromTimestamp === undefined && toTimestamp !== undefined) {
                query = GET_LAST_BUCKETS_TO_TIMESTAMP
                params = [streamId, partition, toTimestamp]
            } else {
                throw new TypeError(
                    `Not correct combination of fromTimestamp (${fromTimestamp}) and toTimestamp (${toTimestamp})`
                )
            }
            return this.getBucketsFromDatabase(query, params, streamId, partition)
        }

        if (fromTimestamp !== undefined) {
            return Promise.all([getExplicitFirst(), getRest()]).then(([first, rest]) => rest.concat(first))
        } else {
            return getRest()
        }
    }

    /**
     * Get latest N buckets or get latest N buckets before some date (to check buckets in the past)
     *
     * @param streamId
     * @param partition
     * @param limit
     * @param timestamp
     * @returns {Promise<[]>}
     */
    async getLastBuckets(
        streamId: string,
        partition: number,
        limit = 1,
        timestamp: number | undefined = undefined
    ): Promise<Bucket[]> {
        const GET_LAST_BUCKETS =
            'SELECT * FROM bucket WHERE stream_id = ? and partition = ?  ORDER BY date_create DESC LIMIT ?'
        const GET_LAST_BUCKETS_TIMESTAMP =
            'SELECT * FROM bucket WHERE stream_id = ? and partition = ? AND date_create <= ? ORDER BY date_create DESC LIMIT ?'

        let query
        let params

        if (timestamp) {
            query = GET_LAST_BUCKETS_TIMESTAMP
            params = [streamId, partition, timestamp, limit]
        } else {
            query = GET_LAST_BUCKETS
            params = [streamId, partition, limit]
        }

        return this.getBucketsFromDatabase(query, params, streamId, partition)
    }

    private async getBucketsFromDatabase(
        query: string,
        params: any,
        streamId: string,
        partition: number
    ): Promise<Bucket[]> {
        const buckets: Bucket[] = []

        const resultSet = await this.cassandraClient.execute(query, params, {
            prepare: true
        })

        resultSet.rows.forEach((row) => {
            const { id, records, size, date_create: dateCreate } = row

            const bucket = new Bucket(
                id.toString(),
                streamId,
                partition,
                size,
                records,
                new Date(dateCreate),
                this.opts.maxBucketSize,
                this.opts.maxBucketRecords,
                this.opts.bucketKeepAliveSeconds
            )

            buckets.push(bucket)
        })

        return buckets
    }

    stop(): void {
        clearInterval(this.checkFullBucketsTimeout)
        clearInterval(this.storeBucketsTimeout)
    }

    private async storeBuckets(): Promise<void> {
        // for non-existing buckets UPDATE works as INSERT
        const UPDATE_BUCKET =
            'UPDATE bucket SET size = ?, records = ?, id = ? WHERE stream_id = ? AND partition = ? AND date_create = ?'

        const notStoredBuckets = Object.values(this.buckets).filter((bucket: Bucket) => !bucket.isStored())

        const results = await Promise.allSettled(
            notStoredBuckets.map(async (bucket) => {
                const { id, size, records, streamId, partition, dateCreate } = bucket
                const params = [size, records, id, streamId, partition, dateCreate]

                await this.cassandraClient.execute(UPDATE_BUCKET, params, {
                    prepare: true
                })
                return {
                    bucket,
                    records
                }
            })
        )

        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                const { bucket: storedBucket, records } = result.value

                if (storedBucket.records === records) {
                    storedBucket.setStored()
                }

                if (!storedBucket.isAlive() && storedBucket.isStored()) {
                    this.removeBucket(storedBucket.getId(), storedBucket.streamId, storedBucket.partition)
                }
            }
        })

        const bucketsToRemove = Object.values(this.buckets).filter(
            (bucket: Bucket) => bucket.isStored() && !bucket.isAlive()
        )
        bucketsToRemove.forEach((bucket: Bucket) =>
            this.removeBucket(bucket.getId(), bucket.streamId, bucket.partition)
        )

        this.storeBucketsTimeout = setTimeout(() => this.storeBuckets(), this.opts.storeBucketsTimeout)
    }

    private removeBucket(bucketId: BucketId, streamId: string, partition: number): void {
        delete this.buckets[bucketId]

        const key = toKey(streamId, partition)
        const stream = this.streamParts[key]
        if (stream) {
            const currentBuckets = stream.buckets.toArray()
            for (let i = 0; i < currentBuckets.length; i++) {
                if (currentBuckets[i].getId() === bucketId) {
                    // eslint-disable-next-line @typescript-eslint/no-array-delete
                    delete currentBuckets[i]
                    break
                }
            }

            // after removing we need to rebuild heap
            stream.buckets = instantiateNewHeap()
            currentBuckets.forEach((bucket: Bucket) => {
                stream.buckets.push(bucket)
            })
        }
    }
}
