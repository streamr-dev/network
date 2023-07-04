import { Wallet } from '@ethersproject/wallet'
import {
    StreamID,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    toStreamID,
    toStreamPartID
} from '@streamr/protocol'
import { EthereumAddress, Multimap, toEthereumAddress } from '@streamr/utils'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import range from 'lodash/range'
import { AddressInfo } from 'net'
import { DEFAULT_PARTITION } from '../../../src/StreamIDBuilder'
import { StreamPermission } from '../../../src/permission'
import { ResendType } from '../../../src/subscribe/Resends'
import { formStorageNodeAssignmentStreamId } from '../../../src/utils/utils'
import { createMockMessage } from '../utils'
import { FakeChain } from './FakeChain'
import { FakeNetwork } from './FakeNetwork'
import { FakeNetworkNode } from './FakeNetworkNode'

const MAX_TIMESTAMP = 8640000000000000 // https://262.ecma-international.org/5.1/#sec-15.9.1.1
const MIN_SEQUENCE_NUMBER = 0
const MAX_SEQUENCE_NUMBER = 2147483647

const startServer = async (
    getMessages: (streamPartId: StreamPartID, resendType: ResendType, queryParams: Record<string, any>) => AsyncIterable<StreamMessage>
): Promise<Server> => {
    const app = express()
    app.get('/streams/:streamId/data/partitions/:partition/:resendType', async (req: Request, res: Response) => {
        const format = req.query.format
        if (format !== 'raw') {
            throw new Error('not implemented')
        }
        const streamPartId = toStreamPartID(toStreamID(req.params.streamId), parseInt(req.params.partition))
        const messages = getMessages(streamPartId, req.params.resendType as ResendType, req.query)
        try {
            for await (const msg of messages) {
                res.write(`${msg.serialize()}\n`)
            }
            res.end()
        } catch (err) {
            res.destroy(err)
        }
    })
    const server = app.listen()
    await once(server, 'listening')
    return server
}

const isStorableMessage = (msg: StreamMessage): boolean => {
    return msg.messageType === StreamMessageType.MESSAGE
}

const parseNumberQueryParameter = (str: string | undefined): number | undefined => {
    return (str !== undefined) ? Number(str) : undefined
}

export class FakeStorageNode extends FakeNetworkNode {

    private readonly streamPartMessages: Multimap<StreamPartID, StreamMessage> = new Multimap()
    private server?: Server
    private readonly wallet: Wallet
    private readonly chain: FakeChain

    constructor(wallet: Wallet, network: FakeNetwork, chain: FakeChain) {
        super({
            networkNode: {
                id: toEthereumAddress(wallet.address)
            }
        } as any, network)
        this.wallet = wallet
        this.chain = chain
    }

    override async start(): Promise<void> {
        super.start()
        this.server = await startServer((streamPartId: StreamPartID, resendType: ResendType, queryParams: Record<string, any>) => {
            switch (resendType) {
                case 'last':
                    return this.getLast(streamPartId, {
                        count: queryParams.count
                    })
                case 'from':
                    return this.getRange(streamPartId, {
                        fromTimestamp: parseNumberQueryParameter(queryParams.fromTimestamp)!,
                        fromSequenceNumber: parseNumberQueryParameter(queryParams.fromSequenceNumber),
                        toTimestamp: MAX_TIMESTAMP,
                        toSequenceNumber: MAX_SEQUENCE_NUMBER,
                        publisherId: queryParams.publisherId
                    })
                case 'range':
                    return this.getRange(streamPartId, {
                        fromTimestamp: parseNumberQueryParameter(queryParams.fromTimestamp)!,
                        fromSequenceNumber: parseNumberQueryParameter(queryParams.fromSequenceNumber),
                        toTimestamp: parseNumberQueryParameter(queryParams.toTimestamp)!,
                        toSequenceNumber: parseNumberQueryParameter(queryParams.toSequenceNumber),
                        publisherId: queryParams.publisherId,
                        msgChainId: queryParams.msgChainId
                    })
                default:
                    throw new Error('assertion failed')
            }
        })
        const port = (this.server.address() as AddressInfo).port
        const address = toEthereumAddress(this.wallet.address)
        this.chain.storageNodeMetadatas.set(address, {
            http: `http://localhost:${port}`
        })
        const storageNodeAssignmentStreamPermissions = new Multimap<EthereumAddress, StreamPermission>()
        storageNodeAssignmentStreamPermissions.add(address, StreamPermission.PUBLISH)
        this.chain.streams.set(formStorageNodeAssignmentStreamId(address), {
            metadata: {
                partitions: 1
            },
            permissions: storageNodeAssignmentStreamPermissions
        })
    }

    override async stop(): Promise<void> {
        super.stop()
        this.server!.close()
        await once(this.server!, 'close')
    }

    async addAssignment(streamId: StreamID): Promise<void> {
        const partitionCount = this.chain.streams.get(streamId)!.metadata.partitions
        const streamParts = range(0, partitionCount).map((p) => toStreamPartID(streamId, p))
        streamParts.forEach(async (streamPartId) => {
            if (!this.subscriptions.has(streamPartId)) {
                this.addMessageListener((msg: StreamMessage) => {
                    if ((msg.getStreamPartID() === streamPartId) && isStorableMessage(msg)) {
                        this.storeMessage(msg)
                    }
                })
                this.subscribe(streamPartId)
                const assignmentMessage = await createMockMessage({
                    streamPartId: toStreamPartID(formStorageNodeAssignmentStreamId(this.id), DEFAULT_PARTITION),
                    publisher: this.wallet,
                    content: {
                        streamPart: streamPartId,
                    }
                })
                await this.publish(assignmentMessage)
            }
        })
    }

    storeMessage(msg: StreamMessage): void {
        const streamPartId = msg.getStreamPartID()
        this.streamPartMessages.add(streamPartId, msg)
    }

    async* getLast(streamPartId: StreamPartID, opts: {
        count: number
    }): AsyncIterable<StreamMessage> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            const firstIndex = Math.max(messages.length - opts.count, 0)
            const lastIndex = Math.min(firstIndex + opts.count, messages.length - 1)
            yield* messages.slice(firstIndex, lastIndex + 1)
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
        }
    }

    async* getRange(streamPartId: StreamPartID, opts: {
        fromTimestamp: number
        fromSequenceNumber?: number
        toTimestamp: number
        toSequenceNumber?: number
        publisherId?: string
        msgChainId?: string
    }): AsyncIterable<StreamMessage> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            const minSequenceNumber = opts.fromSequenceNumber ?? MIN_SEQUENCE_NUMBER
            const maxSequenceNumber = opts.toSequenceNumber ?? MAX_SEQUENCE_NUMBER
            yield* messages.filter((msg) => {
                return ((opts.publisherId === undefined) || (msg.getPublisherId() === opts.publisherId))
                    && ((opts.msgChainId === undefined) || (msg.getMsgChainId() === opts.msgChainId))
                    && (
                        ((msg.getTimestamp() > opts.fromTimestamp) && (msg.getTimestamp() < opts.toTimestamp))
                        || ((msg.getTimestamp() === opts.fromTimestamp) && (msg.getSequenceNumber() >= minSequenceNumber))
                        || ((msg.getTimestamp() === opts.toTimestamp) && (msg.getSequenceNumber() <= maxSequenceNumber))
                    )
            })
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
        }
    }
}
