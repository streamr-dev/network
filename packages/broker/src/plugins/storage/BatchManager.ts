import { Client } from 'cassandra-driver'
import { EventEmitter } from 'events'
import { Logger } from '@streamr/utils'
import type { StreamMessage } from '@streamr/protocol'
import { Batch, BatchId, DoneCallback } from './Batch'
import { BucketId } from './Bucket'

const INSERT_STATEMENT = 'INSERT INTO stream_data '
    + '(stream_id, partition, bucket_id, ts, sequence_no, publisher_id, msg_chain_id, payload) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'

const INSERT_STATEMENT_WITH_TTL = 'INSERT INTO stream_data '
    + '(stream_id, partition, bucket_id, ts, sequence_no, publisher_id, msg_chain_id, payload) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?) USING TTL 259200' // 3 days

export interface BatchManagerOptions {
    useTtl: boolean
    logErrors: boolean
    batchMaxSize: number
    batchMaxRecords: number
    batchCloseTimeout: number
    batchMaxRetries: number
}

let ID = 0

export class BatchManager extends EventEmitter {

    opts: BatchManagerOptions
    batches: Record<BucketId, Batch>
    pendingBatches: Record<BatchId, Batch>
    cassandraClient: Client
    insertStatement: string
    logger: Logger

    constructor(cassandraClient: Client, opts: Partial<BatchManagerOptions> = {}) {
        super()
        ID += 1
        this.logger = new Logger(module, { id: `${ID}` })

        const defaultOptions = {
            useTtl: false,
            logErrors: false,
            batchMaxSize: 8000 * 300,
            batchMaxRecords: 8000,
            batchCloseTimeout: 1000,
            batchMaxRetries: 1000 // in total max ~16 minutes timeout
        }

        this.opts = {
            ...defaultOptions,
            ...opts
        }

        // bucketId => batch
        this.batches = Object.create(null)
        // batchId => batch
        this.pendingBatches = Object.create(null)

        this.cassandraClient = cassandraClient
        this.insertStatement = this.opts.useTtl ? INSERT_STATEMENT_WITH_TTL : INSERT_STATEMENT
    }

    store(bucketId: BucketId, streamMessage: StreamMessage, doneCb?: DoneCallback): void {
        const batch = this.batches[bucketId]

        if (batch && batch.isFull()) {
            batch.lock()
        }

        if (this.batches[bucketId] === undefined) {
            this.logger.trace('Create new batch')

            const newBatch = new Batch(
                bucketId,
                this.opts.batchMaxSize,
                this.opts.batchMaxRecords,
                this.opts.batchCloseTimeout,
                this.opts.batchMaxRetries
            )

            newBatch.on('locked', () => this.moveFullBatch(bucketId, newBatch))
            newBatch.on('pending', () => this.insert(newBatch.getId()))

            this.batches[bucketId] = newBatch
        }

        this.batches[bucketId].push(streamMessage, doneCb)
    }

    stop(): void {
        const { batches, pendingBatches } = this
        this.batches = Object.create(null)
        this.pendingBatches = Object.create(null)
        Object.values(batches).forEach((batch) => batch.clear())
        Object.values(pendingBatches).forEach((batch) => batch.clear())
    }

    private moveFullBatch(bucketId: BucketId, batch: Batch): void {
        const batchId = batch.getId()
        this.pendingBatches[batchId] = batch
        batch.scheduleInsert()

        delete this.batches[bucketId]
    }

    private async insert(batchId: BatchId): Promise<void> {
        const batch = this.pendingBatches[batchId]

        try {
            const queries = batch.streamMessages.map((streamMessage) => {
                return {
                    query: this.insertStatement,
                    params: [
                        streamMessage.getStreamId(),
                        streamMessage.getStreamPartition(),
                        batch.getBucketId(),
                        streamMessage.getTimestamp(),
                        streamMessage.getSequenceNumber(),
                        streamMessage.getPublisherId(),
                        streamMessage.getMsgChainId(),
                        Buffer.from(streamMessage.serialize()),
                    ]
                }
            })

            await this.cassandraClient.batch(queries, {
                prepare: true
            })

            this.logger.trace({ batchId: batch.getId() }, 'Insert batch')
            batch.done()
            batch.clear()
            delete this.pendingBatches[batch.getId()]
        } catch (err) {
            if (this.opts.logErrors) {
                this.logger.error({ batchId, err }, 'Failed to insert batch')
            }

            // stop if reached max retries
            // TODO: This probably belongs in Batch
            if (batch.reachedMaxRetries()) {
                if (this.opts.logErrors) {
                    this.logger.error({
                        batchId: batch.getId(),
                        retries: batch.retries
                    }, 'Drop batch (max retries reached)')
                }
                batch.clear()
                delete this.pendingBatches[batch.getId()]
                return
            }

            batch.scheduleInsert()
        }
    }
}
