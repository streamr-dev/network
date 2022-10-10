import { random } from 'lodash'
import { EncryptedGroupKey, EncryptionType, EthereumAddress, StreamID, StreamMessage, toStreamPartID } from 'streamr-client-protocol'
import { EncryptionUtil } from '../encryption/EncryptionUtil'
import { GroupKeyId } from '../encryption/GroupKey'
import { createRandomMsgChainId, MessageChain } from './MessageChain'
import { MessageMetadata } from './Publisher'
import { keyToArrayIndex } from '@streamr/utils'
import { GroupKeySequence } from './GroupKeyQueue'
import { Mapping } from '../utils/Mapping'

export interface MessageFactoryOptions {
    publisherId: EthereumAddress
    streamId: StreamID
    getPartitionCount: (streamId: StreamID) => Promise<number>
    isPublicStream: (streamId: StreamID) => Promise<boolean>
    isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => Promise<boolean>
    createSignature: (payload: string) => Promise<string>
    useGroupKey: () => Promise<GroupKeySequence>
}

export class MessageFactory {

    private readonly publisherId: EthereumAddress
    private readonly streamId: StreamID
    private defaultPartition: number | undefined
    private readonly defaultMessageChainIds: Mapping<[partition: number], string>
    private readonly messageChains: Mapping<[partition: number, msgChainId: string], MessageChain>
    private readonly getPartitionCount: (streamId: StreamID) => Promise<number>
    private readonly isPublicStream: (streamId: StreamID) => Promise<boolean>
    private readonly isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => Promise<boolean>
    private readonly createSignature: (payload: string) => Promise<string>
    private readonly useGroupKey: () => Promise<GroupKeySequence>

    constructor(opts: MessageFactoryOptions) {
        this.publisherId = opts.publisherId
        this.streamId = opts.streamId
        this.getPartitionCount = opts.getPartitionCount
        this.isPublicStream = opts.isPublicStream
        this.isPublisher = opts.isPublisher
        this.createSignature = opts.createSignature
        this.useGroupKey = opts.useGroupKey
        this.defaultMessageChainIds = new Mapping(async (_partition: number) => {
            return createRandomMsgChainId()
        })
        this.messageChains = new Mapping(async (partition: number, msgChainId: string) => {
            return new MessageChain(toStreamPartID(this.streamId, partition), this.publisherId, msgChainId)
        })
    }

    /* eslint-disable padding-line-between-statements */
    async createMessage<T>(
        content: T,
        metadata: MessageMetadata & { timestamp: number },
        explicitPartition?: number
    ): Promise<StreamMessage<T>> {
        const isPublisher = await this.isPublisher(this.streamId, this.publisherId)
        if (!isPublisher) {
            throw new Error(`${this.publisherId} is not a publisher on stream ${this.streamId}`)
        }

        const partitionCount = await this.getPartitionCount(this.streamId)
        let partition
        if (explicitPartition !== undefined) {
            if ((explicitPartition < 0 || explicitPartition >= partitionCount)) {
                throw new Error(`Partition ${explicitPartition} is out of range (0..${partitionCount - 1})`)
            }
            if (metadata.partitionKey !== undefined) {
                throw new Error('Invalid combination of "partition" and "partitionKey"')
            }
            partition = explicitPartition
        } else {
            partition = (metadata.partitionKey !== undefined)
                ? keyToArrayIndex(partitionCount, metadata.partitionKey)
                : this.getDefaultPartition(partitionCount)
        }

        const chain = await this.messageChains.get(
            partition,
            metadata.msgChainId ?? await this.defaultMessageChainIds.get(partition)
        )
        const [messageId, prevMsgRef] = chain.add(metadata.timestamp)

        const encryptionType = (await this.isPublicStream(this.streamId)) ? EncryptionType.NONE : EncryptionType.AES
        let groupKeyId: GroupKeyId | undefined
        let newGroupKey: EncryptedGroupKey | undefined
        let serializedContent = JSON.stringify(content)
        if (encryptionType === EncryptionType.AES) {
            const keySequence = await this.useGroupKey()
            serializedContent = EncryptionUtil.encryptWithAES(Buffer.from(serializedContent, 'utf8'), keySequence.current.data)
            groupKeyId = keySequence.current.id
            if (keySequence.next !== undefined) {
                newGroupKey = keySequence.current.encryptNextGroupKey(keySequence.next)
            }
        }

        const message = new StreamMessage<T>({
            content: serializedContent,
            messageId,
            prevMsgRef,
            encryptionType,
            groupKeyId,
            newGroupKey,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH
        })
        message.signature = await this.createSignature(message.getPayloadToSign())

        return message
    }

    private getDefaultPartition(partitionCount: number): number {
        // we want to (re-)select a random partition in these two situations
        // 1) this is the first publish, and we have not yet selected any partition (the most typical case)
        // 2) the partition count may have decreased since we initially selected a random partitions, and it
        //    is now out-of-range (very rare case)
        if ((this.defaultPartition === undefined) || (this.defaultPartition >= partitionCount)) {
            this.defaultPartition = random(partitionCount - 1)
        }
        return this.defaultPartition
    }
}
