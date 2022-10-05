import { random } from 'lodash'
import { EncryptedGroupKey, EncryptionType, EthereumAddress, StreamID, StreamMessage, StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { CacheConfig } from '../Config'
import { EncryptionUtil } from '../encryption/EncryptionUtil'
import { GroupKeyId } from '../encryption/GroupKey'
import { CacheFn } from '../utils/caches'
import { MessageChain } from './MessageChain'
import { MessageMetadata } from './Publisher'
import { keyToArrayIndex } from '@streamr/utils'
import { GroupKeySequence } from './GroupKeyQueue'

export interface MessageFactoryOptions {
    publisherId: EthereumAddress
    streamId: StreamID
    partitionCount: number
    isPublicStream: boolean
    isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => Promise<boolean>
    createSignature: (payload: string) => Promise<string>
    useGroupKey: () => Promise<GroupKeySequence>
    cacheConfig?: CacheConfig
}

export class MessageFactory {

    private readonly publisherId: EthereumAddress
    private readonly streamId: StreamID
    private readonly partitionCount: number
    private readonly selectedDefaultPartition: number
    private readonly isPublicStream: boolean
    private readonly isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => Promise<boolean>
    private readonly createSignature: (payload: string) => Promise<string>
    private readonly useGroupKey: () => Promise<GroupKeySequence>
    private readonly getStreamPartitionForKey: (partitionKey: string | number) => number
    private readonly getMsgChain: (streamPartId: StreamPartID, publisherId: EthereumAddress, msgChainId?: string) => MessageChain

    constructor(opts: MessageFactoryOptions) {
        this.publisherId = opts.publisherId
        this.streamId = opts.streamId
        this.partitionCount = opts.partitionCount
        this.selectedDefaultPartition = random(opts.partitionCount - 1)
        this.isPublicStream = opts.isPublicStream
        this.isPublisher = opts.isPublisher
        this.createSignature = opts.createSignature
        this.useGroupKey = opts.useGroupKey
        this.getStreamPartitionForKey = CacheFn((partitionKey: string | number) => {
            return keyToArrayIndex(opts.partitionCount, partitionKey)
        }, {
            ...opts.cacheConfig,
            cacheKey: ([partitionKey]) => partitionKey
        })
        this.getMsgChain = CacheFn((streamPartId: StreamPartID, publisherId: EthereumAddress, msgChainId?: string) => { // TODO would it ok to just use pMemoize (we don't have many chains)
            return new MessageChain(streamPartId, publisherId, msgChainId)
        }, {
            cacheKey: ([streamPartId, publisherId, msgChainId]) => [streamPartId, publisherId, msgChainId ?? ''].join('|'),
            ...opts.cacheConfig,
            maxAge: Infinity
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
        if (explicitPartition !== undefined) {
            if ((explicitPartition < 0 || explicitPartition >= this.partitionCount)) {
                throw new Error(`Partition ${explicitPartition} is out of range (0..${this.partitionCount - 1})`)
            }
            if (metadata?.partitionKey !== undefined) {
                throw new Error('Invalid combination of "partition" and "partitionKey"')
            }
        }

        const partition = explicitPartition
            ?? ((metadata.partitionKey !== undefined)
                ? this.getStreamPartitionForKey(metadata.partitionKey!)
                : this.selectedDefaultPartition)
        const streamPartId = toStreamPartID(this.streamId, partition)
        const chain = this.getMsgChain(streamPartId, this.publisherId, metadata?.msgChainId)
        const [messageId, prevMsgRef] = chain.add(metadata.timestamp)

        const encryptionType = this.isPublicStream ? StreamMessage.ENCRYPTION_TYPES.NONE : StreamMessage.ENCRYPTION_TYPES.AES
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

        const message = new StreamMessage<any>({
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
}
