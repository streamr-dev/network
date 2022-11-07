import { range } from 'lodash'
import {
    StreamID,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    toStreamPartID
} from '@streamr/protocol'
import { FakeNetworkNode } from './FakeNetworkNode'
import { FakeNetwork } from './FakeNetwork'
import { formStorageNodeAssignmentStreamId } from '../../../src/utils/utils'
import { EthereumAddress, Multimap, toEthereumAddress } from '@streamr/utils'
import { FakeChain } from './FakeChain'
import { StreamPermission } from '../../../src/permission'
import { Wallet } from 'ethers'
import { createMockMessage } from '../utils'
import { DEFAULT_PARTITION } from '../../../src/StreamIDBuilder'

const URL_SCHEME = 'FakeStorageNode'

const createStorageNodeUrl = (address: EthereumAddress): string => `${URL_SCHEME}://${address}`

export const parseNodeIdFromStorageNodeUrl = (url: string): EthereumAddress => {
    const groups = url.match(new RegExp('(.*)://([^/]*)(/.*)?'))
    if ((groups !== null) && (groups[1] === URL_SCHEME)) {
        return toEthereumAddress(groups[2])
    } else {
        throw new Error(`unknown storage node url: ${url}`)
    }
}

const isStorableMessage = (msg: StreamMessage): boolean => {
    return msg.messageType === StreamMessageType.MESSAGE
}

export class FakeStorageNode extends FakeNetworkNode {

    private readonly streamPartMessages: Multimap<StreamPartID, StreamMessage> = new Multimap()
    private readonly wallet: Wallet
    private readonly chain: FakeChain

    constructor(wallet: Wallet, network: FakeNetwork, chain: FakeChain) {
        super({
            id: toEthereumAddress(wallet.address)
        } as any, network)
        this.wallet = wallet
        this.chain = chain
        const address = toEthereumAddress(wallet.address)
        chain.storageNodeMetadatas.set(address, {
            http: createStorageNodeUrl(address)
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
                this.publish(assignmentMessage)
            }
        })
    }

    storeMessage(msg: StreamMessage): void {
        const streamPartId = msg.getStreamPartID()
        this.streamPartMessages.add(streamPartId, msg)
    }

    async getLast(streamPartId: StreamPartID, count: number): Promise<StreamMessage[]> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            const firstIndex = Math.max(messages.length - count, 0)
            const lastIndex = Math.min(firstIndex + count, messages.length - 1)
            return messages.slice(firstIndex, lastIndex + 1).map((msg: StreamMessage) => {
                // return a clone as client mutates message when it decrypts messages
                const serialized = msg.serialize()
                return StreamMessage.deserialize(serialized)
            })
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
            return []
        }
    }

    async getRange(streamPartId: StreamPartID, opts: {
        fromTimestamp: number
        fromSequenceNumber: number
        toTimestamp: number
        toSequenceNumber: number
        publisherId?: string
        msgChainId?: string
    }): Promise<StreamMessage[]> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            return messages.filter((msg) => {
                return ((opts.publisherId === undefined) || (msg.getPublisherId() === opts.publisherId))
                    && ((opts.msgChainId === undefined) || (msg.getMsgChainId() === opts.msgChainId))
                    && (
                        ((msg.getTimestamp() > opts.fromTimestamp) && (msg.getTimestamp() < opts.toTimestamp))
                        || ((msg.getTimestamp() === opts.fromTimestamp) && (msg.getSequenceNumber() >= opts.fromSequenceNumber))
                        || ((msg.getTimestamp() === opts.toTimestamp) && (msg.getSequenceNumber() <= opts.toSequenceNumber))
                    )
            })
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
            return []
        }
    }
}
