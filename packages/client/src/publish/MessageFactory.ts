import { random } from 'lodash'
import { 
    EncryptedGroupKey,
    EncryptionType,
    EthereumAddress,
    SignatureType,
    StreamID,
    StreamMessage,
    StreamMessageOptions,
    toStreamPartID
} from 'streamr-client-protocol'
import { EncryptionUtil } from '../encryption/EncryptionUtil'
import { GroupKeyId } from '../encryption/GroupKey'
import { createRandomMsgChainId, MessageChain } from './MessageChain'
import { MessageMetadata } from './Publisher'
import { keyToArrayIndex } from '@streamr/utils'
import { GroupKeySequence } from './GroupKeyQueue'
import { Mapping } from '../utils/Mapping'
import { Authentication } from '../Authentication'

export interface MessageFactoryOptions {
    streamId: StreamID
    authentication: Authentication
    getPartitionCount: (streamId: StreamID) => Promise<number>
    isPublicStream: (streamId: StreamID) => Promise<boolean>
    isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => Promise<boolean>
    useGroupKey: () => Promise<GroupKeySequence>
}

export const createSignedMessage = async <T>(
    opts: Omit<StreamMessageOptions<T>, 'signature' | 'signatureType' | 'content'> 
    & { serializedContent: string, authentication: Authentication }
): Promise<StreamMessage<T>> => {
    const msg = new StreamMessage<T>({
        ...opts,
        signatureType: SignatureType.ETH,
        content: opts.serializedContent,
    })
    msg.signature = await opts.authentication.createMessagePayloadSignature(msg.getPayloadToSign())
    return msg
}

export class MessageFactory {

    private readonly streamId: StreamID
    private readonly authentication: Authentication
    private defaultPartition: number | undefined
    private readonly defaultMessageChainIds: Mapping<[partition: number], string>
    private readonly messageChains: Mapping<[partition: number, msgChainId: string], MessageChain>
    private readonly getPartitionCount: (streamId: StreamID) => Promise<number>
    private readonly isPublicStream: (streamId: StreamID) => Promise<boolean>
    private readonly isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => Promise<boolean>
    private readonly useGroupKey: () => Promise<GroupKeySequence>

    constructor(opts: MessageFactoryOptions) {
        this.streamId = opts.streamId
        this.authentication = opts.authentication
        this.getPartitionCount = opts.getPartitionCount
        this.isPublicStream = opts.isPublicStream
        this.isPublisher = opts.isPublisher
        this.useGroupKey = opts.useGroupKey
        this.defaultMessageChainIds = new Mapping(async (_partition: number) => {
            return createRandomMsgChainId()
        })
        this.messageChains = new Mapping(async (partition: number, msgChainId: string) => {
            const publisherId = await this.authentication.getAddress()
            return new MessageChain(toStreamPartID(this.streamId, partition), publisherId, msgChainId)
        })
    }

    /* eslint-disable padding-line-between-statements */
    async createMessage<T>(
        content: T,
        metadata: MessageMetadata & { timestamp: number },
        explicitPartition?: number
    ): Promise<StreamMessage<T>> {
        const publisherId = await this.authentication.getAddress()
        const isPublisher = await this.isPublisher(this.streamId, publisherId)
        if (!isPublisher) {
            throw new Error(`${publisherId} is not a publisher on stream ${this.streamId}`)
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

        return createSignedMessage<T>({
            messageId,
            serializedContent,
            prevMsgRef,
            encryptionType,
            groupKeyId,
            newGroupKey,
            authentication: this.authentication
        })
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
