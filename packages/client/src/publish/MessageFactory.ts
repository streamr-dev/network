import { random } from 'lodash'
import {
    createSignaturePayload,
    EncryptedGroupKey,
    EncryptionType,
    MessageID,
    MessageRef,
    StreamID,
    StreamMessage,
    StreamMessageOptions
} from 'streamr-client-protocol'
import { EncryptionUtil } from '../encryption/EncryptionUtil'
import { GroupKeyId } from '../encryption/GroupKey'
import { createMessageRef, createRandomMsgChainId } from './messageChain'
import { MessageMetadata } from './Publisher'
import { keyToArrayIndex } from '@streamr/utils'
import { GroupKeyQueue } from './GroupKeyQueue'
import { Mapping } from '../utils/Mapping'
import { Authentication } from '../Authentication'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { formLookupKey } from '../utils/utils'

export interface MessageFactoryOptions {
    streamId: StreamID
    authentication: Authentication
    streamRegistry: Pick<StreamRegistryCached, 'getStream' | 'isPublic' | 'isStreamPublisher'>
    groupKeyQueue: GroupKeyQueue
}

export const createSignedMessage = async <T>(
    opts: Omit<StreamMessageOptions<T>, 'signature' | 'content'>
    & { serializedContent: string, authentication: Authentication }
): Promise<StreamMessage<T>> => {
    const signature = await opts.authentication.createMessageSignature(createSignaturePayload({
        messageId: opts.messageId,
        serializedContent: opts.serializedContent,
        prevMsgRef: opts.prevMsgRef ?? undefined,
        newGroupKey: opts.newGroupKey ?? undefined
    }))
    return new StreamMessage<T>({
        ...opts,
        signature,
        content: opts.serializedContent,
    })
}

export class MessageFactory {

    private readonly streamId: StreamID
    private readonly authentication: Authentication
    private defaultPartition: number | undefined
    private readonly defaultMessageChainIds: Mapping<[partition: number], string>
    private readonly prevMsgRefs: Map<string, MessageRef> = new Map()
    private readonly streamRegistry: Pick<StreamRegistryCached, 'getStream' | 'isPublic' | 'isStreamPublisher'>
    private readonly groupKeyQueue: GroupKeyQueue

    constructor(opts: MessageFactoryOptions) {
        this.streamId = opts.streamId
        this.authentication = opts.authentication
        this.streamRegistry = opts.streamRegistry
        this.groupKeyQueue = opts.groupKeyQueue
        this.defaultMessageChainIds = new Mapping(async (_partition: number) => {
            return createRandomMsgChainId()
        })
    }

    /* eslint-disable padding-line-between-statements */
    async createMessage<T>(
        content: T,
        metadata: MessageMetadata & { timestamp: number },
        explicitPartition?: number
    ): Promise<StreamMessage<T>> {
        const publisherId = await this.authentication.getAddress()
        const isPublisher = await this.streamRegistry.isStreamPublisher(this.streamId, publisherId)
        if (!isPublisher) {
            throw new Error(`${publisherId} is not a publisher on stream ${this.streamId}`)
        }

        const partitionCount = (await this.streamRegistry.getStream(this.streamId)).getMetadata().partitions
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

        const msgChainId = metadata.msgChainId ?? await this.defaultMessageChainIds.get(partition)
        const msgChainKey = formLookupKey(partition, msgChainId)
        const prevMsgRef = this.prevMsgRefs.get(msgChainKey)
        const msgRef = createMessageRef(metadata.timestamp, prevMsgRef)
        this.prevMsgRefs.set(msgChainKey, msgRef)
        const messageId = new MessageID(this.streamId, partition, msgRef.timestamp, msgRef.sequenceNumber, publisherId, msgChainId)

        const encryptionType = (await this.streamRegistry.isPublic(this.streamId)) ? EncryptionType.NONE : EncryptionType.AES
        let groupKeyId: GroupKeyId | undefined
        let newGroupKey: EncryptedGroupKey | undefined
        let serializedContent = JSON.stringify(content)
        if (encryptionType === EncryptionType.AES) {
            const keySequence = await this.groupKeyQueue.useGroupKey()
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
