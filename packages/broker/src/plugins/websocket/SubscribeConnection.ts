import WebSocket from 'ws'
import { StreamrClient, Subscription } from 'streamr-client'
import { Connection } from './Connection'
import { parsePositiveInteger, parseQueryParameterArray } from '../../helpers/parser'
import { ParsedQs } from 'qs'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { Logger } from '@streamr/utils'

export class SubscribeConnection implements Connection {

    private readonly streamId: string
    private readonly partitions?: number[]
    private readonly subscriptions: Subscription[]

    constructor( streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partitions = parseQueryParameterArray('partitions', queryParams, parsePositiveInteger)
        this.subscriptions = []
    }

    async init(
        ws: WebSocket,
        socketId: string,
        streamrClient: StreamrClient,
        payloadFormat: PayloadFormat
    ): Promise<void> {
        const logger = new Logger(module, { socketId })
        const streamPartDefinitions = (this.partitions !== undefined)
            ? this.partitions.map((partition: number) => ({ id: this.streamId, partition }))
            : [{ id: this.streamId }]
        logger.debug('Subscribing to stream partitions', {
            streamId: this.streamId,
            partitions: this.partitions
        })
        for (const streamDefinition of streamPartDefinitions) {
            let sub: Subscription
            try {
                sub = await streamrClient.subscribe(streamDefinition, (content, metadata) => {
                    const payload = payloadFormat.createPayload(content as any, metadata)
                    ws.send(payload)
                })
            } catch (err) {
                await this.unsubAll(logger)
                throw err
            }
            this.subscriptions.push(sub)
        }
        ws.once('close', async () => {
            try {
                await this.unsubAll(logger)
            } finally {
                logger.info('Disconnected from client', { socketId })
            }
        })
        logger.debug('Subscribed to stream partitions', {
            streamId: this.streamId,
            partitions: this.partitions
        })
    }

    private async unsubAll(logger: Logger): Promise<void> {
        logger.debug('Unsubscribe from streams', {
            subscriptions: this.subscriptions.map(({ streamPartId }) => streamPartId)
        })
        await Promise.all(this.subscriptions.map((sub) => sub.unsubscribe()))
    }
}
