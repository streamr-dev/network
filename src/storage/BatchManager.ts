import { Client } from 'cassandra-driver'
import { EventEmitter } from 'events'
import { Protocol } from 'streamr-network'
import { getLogger } from '../helpers/logger'
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
    batches: Record<BucketId,Batch>
    pendingBatches: Record<BatchId,Batch>
    cassandraClient: Client
    insertStatement: string
    logger

    constructor(cassandraClient: Client, opts: Partial<BatchManagerOptions> = {}) {
        super()
        ID += 1
        const id = `${this.constructor.name}${ID}`
        this.logger = getLogger(`streamr:storage:${id}`)

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
        this.logger.debug('create %o', this.opts)
    }

    store(bucketId: BucketId, streamMessage: Protocol.StreamMessage, doneCb?: DoneCallback): void {
        const batch = this.batches[bucketId]

        if (batch && batch.isFull()) {
            batch.lock()
        }

        if (this.batches[bucketId] === undefined) {
            this.logger.debug('creating new batch')

            const newBatch = new Batch(
                bucketId,
                this.opts.batchMaxSize,
                this.opts.batchMaxRecords,
                this.opts.batchCloseTimeout,
                this.opts.batchMaxRetries
            )

            newBatch.on('locked', () => this._moveFullBatch(bucketId, newBatch))
            newBatch.on('pending', () => this._insert(newBatch.getId()))

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

    private _moveFullBatch(bucketId: BucketId, batch: Batch): void {
        this.logger.debug('moving batch to pendingBatches')
        const batchId = batch.getId()
        this.pendingBatches[batchId] = batch
        batch.scheduleInsert()

        delete this.batches[bucketId]
    }

    private async _insert(batchId: BatchId): Promise<void> {
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

            this.logger.debug(`inserted batch id:${batch.getId()}`)
            batch.done()
            batch.clear()
            delete this.pendingBatches[batch.getId()]
        } catch (err) {
            this.logger.debug(`failed to insert batch, error ${err}`)
            if (this.opts.logErrors) {
                this.logger.error(`Failed to insert batchId: (${batchId})`)
                this.logger.error(err)
            }

            // stop if reached max retries
            // TODO: This probably belongs in Batch
            if (batch.reachedMaxRetries()) {
                if (this.opts.logErrors) {
                    this.logger.error(`Batch %s reached max retries %s, dropping batch`, batch.getId(), batch.retries)
                }
                batch.clear()
                delete this.pendingBatches[batch.getId()]
                return
            }

            batch.scheduleInsert()
        }
    }

    metrics(): {
        totalBatches: number,
        meanBatchAge: number,
        meanBatchRetries: number,
        batchesWithFiveOrMoreRetries: number,
        batchesWithTenOrMoreRetries: number,
        batchesWithHundredOrMoreRetries: number,
        } {
        const now = Date.now()
        const { batches, pendingBatches } = this
        const totalBatches = Object.values(batches).length + Object.values(pendingBatches).length
        const meanBatchAge = totalBatches === 0 ? 0
            : [
                ...Object.values(batches),
                ...Object.values(pendingBatches)
            ].reduce((acc, batch) => acc + (now - batch.createdAt), 0) / totalBatches
        const meanBatchRetries = totalBatches === 0 ? 0
            : Object.values(pendingBatches).reduce((acc, batch) => acc + batch.retries, 0) / totalBatches

        let batchesWithFiveOrMoreRetries = 0
        let batchesWithTenOrMoreRetries = 0
        let batchesWithHundredOrMoreRetries = 0

        Object.values(pendingBatches).forEach((batch) => {
            if (batch.retries >= 5) {
                batchesWithFiveOrMoreRetries += 1
                if (batch.retries >= 10) {
                    batchesWithTenOrMoreRetries += 1
                    if (batch.retries >= 100) {
                        batchesWithHundredOrMoreRetries += 1
                    }
                }
            }
        })

        return {
            totalBatches,
            meanBatchAge,
            meanBatchRetries,
            batchesWithFiveOrMoreRetries,
            batchesWithTenOrMoreRetries,
            batchesWithHundredOrMoreRetries,
        }
    }
}
