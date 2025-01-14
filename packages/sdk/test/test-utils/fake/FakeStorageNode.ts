import { fastWallet } from '@streamr/test-utils'
import {
    EthereumAddress,
    Multimap,
    StreamID,
    StreamPartID,
    toEthereumAddress,
    toLengthPrefixedFrame,
    toStreamID,
    toStreamPartID,
    toUserId,
    UserID
} from '@streamr/utils'
import { Wallet } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import range from 'lodash/range'
import { AddressInfo } from 'net'
import { NetworkNodeFacade } from '../../../src/NetworkNodeFacade'
import { DEFAULT_PARTITION } from '../../../src/StreamIDBuilder'
import { StreamPermission } from '../../../src/permission'
import { StreamMessage, StreamMessageType } from '../../../src/protocol/StreamMessage'
import { convertStreamMessageToBytes } from '../../../src/protocol/oldStreamMessageBinaryUtils'
import { ResendType } from '../../../src/subscribe/Resends'
import { formStorageNodeAssignmentStreamId } from '../../../src/utils/utils'
import { createMockMessage } from '../utils'
import { FakeChain } from './FakeChain'
import { FakeEnvironment } from './FakeEnvironment'

const MAX_TIMESTAMP = 8640000000000000 // https://262.ecma-international.org/5.1/#sec-15.9.1.1
const MIN_SEQUENCE_NUMBER = 0
const MAX_SEQUENCE_NUMBER = 2147483647

const startServer = async (
    getMessages: (
        streamPartId: StreamPartID,
        resendType: ResendType,
        queryParams: Record<string, any>
    ) => AsyncIterable<StreamMessage>
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
                res.write(toLengthPrefixedFrame(convertStreamMessageToBytes(msg)))
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
    return str !== undefined ? Number(str) : undefined
}

export class FakeStorageNode {
    private readonly streamPartMessages: Multimap<StreamPartID, StreamMessage> = new Multimap()
    private server?: Server
    private readonly wallet: Wallet
    private readonly node: NetworkNodeFacade
    private readonly chain: FakeChain

    constructor(environment: FakeEnvironment) {
        this.wallet = fastWallet()
        this.node = environment.createNode()
        this.chain = environment.getChain()
        this.chain.on('streamAddedToStorageNode', (event) => {
            if (event.nodeAddress === this.getAddress()) {
                this.addStream(event.streamId)
            }
        })
        environment.getDestroySignal().onDestroy.listen(() => {
            return this.stop()
        })
    }

    getAddress(): EthereumAddress {
        return toEthereumAddress(this.wallet.address)
    }

    async start(): Promise<void> {
        this.server = await startServer(
            (streamPartId: StreamPartID, resendType: ResendType, queryParams: Record<string, any>) => {
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
            }
        )
        const port = (this.server.address() as AddressInfo).port
        this.chain.setStorageNodeMetadata(this.getAddress(), {
            urls: [`http://127.0.0.1:${port}`]
        })
        const storageNodeAssignmentStreamPermissions = new Multimap<UserID, StreamPermission>()
        storageNodeAssignmentStreamPermissions.add(toUserId(this.getAddress()), StreamPermission.PUBLISH)
        this.chain.setStream(formStorageNodeAssignmentStreamId(this.getAddress()), {
            metadata: {
                partitions: 1
            },
            permissions: storageNodeAssignmentStreamPermissions
        })
    }

    async stop(): Promise<void> {
        this.server!.close()
        await once(this.server!, 'close')
    }

    private async addStream(streamId: StreamID): Promise<void> {
        const partitionCount = this.chain.getStream(streamId)!.metadata.partitions as number
        const streamParts = range(0, partitionCount).map((p) => toStreamPartID(streamId, p))
        streamParts.forEach(async (streamPartId) => {
            if (!(await this.node.getStreamParts()).includes(streamPartId)) {
                this.node.addMessageListener((msg: StreamMessage) => {
                    if (msg.getStreamPartID() === streamPartId && isStorableMessage(msg)) {
                        this.storeMessage(msg)
                    }
                })
                await this.node.join(streamPartId)
                const assignmentMessage = await createMockMessage({
                    streamPartId: toStreamPartID(
                        formStorageNodeAssignmentStreamId(this.getAddress()),
                        DEFAULT_PARTITION
                    ),
                    publisher: this.wallet,
                    content: {
                        streamPart: streamPartId
                    }
                })
                await this.node.broadcast(assignmentMessage)
            }
        })
    }

    storeMessage(msg: StreamMessage): void {
        const streamPartId = msg.getStreamPartID()
        this.streamPartMessages.add(streamPartId, msg)
    }

    async *getLast(
        streamPartId: StreamPartID,
        opts: {
            count: number
        }
    ): AsyncIterable<StreamMessage> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            const firstIndex = Math.max(messages.length - opts.count, 0)
            const lastIndex = Math.min(firstIndex + opts.count, messages.length - 1)
            yield* messages.slice(firstIndex, lastIndex + 1)
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
        }
    }

    async *getRange(
        streamPartId: StreamPartID,
        opts: {
            fromTimestamp: number
            fromSequenceNumber?: number
            toTimestamp: number
            toSequenceNumber?: number
            publisherId?: string
            msgChainId?: string
        }
    ): AsyncIterable<StreamMessage> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            const minSequenceNumber = opts.fromSequenceNumber ?? MIN_SEQUENCE_NUMBER
            const maxSequenceNumber = opts.toSequenceNumber ?? MAX_SEQUENCE_NUMBER
            yield* messages.filter((msg) => {
                return (
                    (opts.publisherId === undefined || msg.getPublisherId() === opts.publisherId) &&
                    (opts.msgChainId === undefined || msg.getMsgChainId() === opts.msgChainId) &&
                    ((msg.getTimestamp() > opts.fromTimestamp && msg.getTimestamp() < opts.toTimestamp) ||
                        (msg.getTimestamp() === opts.fromTimestamp && msg.getSequenceNumber() >= minSequenceNumber) ||
                        (msg.getTimestamp() === opts.toTimestamp && msg.getSequenceNumber() <= maxSequenceNumber))
                )
            })
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
        }
    }
}
