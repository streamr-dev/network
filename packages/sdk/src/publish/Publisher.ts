import { StreamID } from '@streamr/utils'
import isString from 'lodash/isString'
import pLimit from 'p-limit'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamrClientError } from '../StreamrClientError'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamMessage } from '../protocol/StreamMessage'
import { MessageSigner } from '../signature/MessageSigner'
import { SignatureValidator } from '../signature/SignatureValidator'
import { StreamDefinition } from '../types'
import { createLazyMap, Mapping } from '../utils/Mapping'
import { GroupKeyQueue } from './GroupKeyQueue'
import { MessageFactory } from './MessageFactory'

export interface PublishMetadata {
    timestamp?: string | number | Date
    partitionKey?: string | number
    msgChainId?: string

    /**
     * Publish a message on behalf of a contract implementing the [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)
     * standard. The streamr client wallet address must be an authorized signer for the contract.
     */
    erc1271Contract?: string
}

const parseTimestamp = (metadata?: PublishMetadata): number => {
    if (metadata?.timestamp === undefined) {
        return Date.now()
    } else {
        return metadata.timestamp instanceof Date
            ? metadata.timestamp.getTime()
            : isString(metadata.timestamp)
              ? new Date(metadata.timestamp).getTime()
              : metadata.timestamp
    }
}

@scoped(Lifecycle.ContainerScoped)
export class Publisher {
    private readonly messageFactories: Mapping<StreamID, MessageFactory>
    private readonly groupKeyQueues: Mapping<StreamID, GroupKeyQueue>
    private readonly concurrencyLimit = pLimit(1)
    private readonly node: NetworkNodeFacade
    private readonly streamRegistry: StreamRegistry
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly authentication: Authentication
    private readonly signatureValidator: SignatureValidator
    private readonly messageSigner: MessageSigner

    constructor(
        node: NetworkNodeFacade,
        streamRegistry: StreamRegistry,
        groupKeyManager: GroupKeyManager,
        streamIdBuilder: StreamIDBuilder,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        signatureValidator: SignatureValidator,
        messageSigner: MessageSigner
    ) {
        this.node = node
        this.streamRegistry = streamRegistry
        this.streamIdBuilder = streamIdBuilder
        this.authentication = authentication
        this.signatureValidator = signatureValidator
        this.messageSigner = messageSigner
        this.messageFactories = createLazyMap({
            valueFactory: async (streamId) => {
                return this.createMessageFactory(streamId)
            }
        })
        this.groupKeyQueues = createLazyMap({
            valueFactory: async (streamId) => {
                return GroupKeyQueue.createInstance(streamId, this.authentication, groupKeyManager)
            }
        })
    }

    async publish(
        streamDefinition: StreamDefinition,
        content: unknown,
        metadata?: PublishMetadata
    ): Promise<StreamMessage> {
        const timestamp = parseTimestamp(metadata)
        /*
         * There are some steps in the publish process which need to be done sequentially:
         * - message chaining
         * - consuming a group key from a queue
         *
         * It is also good if messages are published to node in the same sequence (within
         * a message chain), as that can avoid unnecessary gap fills: if a subscriber would
         * receive messages m1, m2, m3 in order m1, m3, m2 it would try to get m2 via
         * a gap fill resend before it receives it normally).
         *
         * Currently we limit that there can be only one publish task at any given time.
         * That way message chaining and group keys consuming is done properly. If we want
         * to improve concurrency, we could maybe offload message encryptions to a separate
         * tasks which we'd execute in parallel.
         */
        return this.concurrencyLimit(async () => {
            const [streamId, partition] = await this.streamIdBuilder.toStreamPartElements(streamDefinition)
            try {
                const messageFactory = await this.messageFactories.get(streamId)
                const message = await messageFactory.createMessage(
                    content,
                    {
                        ...metadata,
                        timestamp
                    },
                    partition
                )
                await this.node.broadcast(message)
                return message
            } catch (e) {
                const errorCode = e instanceof StreamrClientError ? e.code : 'UNKNOWN_ERROR'
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new StreamrClientError(`Failed to publish to stream ${streamId}. Cause: ${e.message}`, errorCode)
            }
        })
    }

    getGroupKeyQueue(streamId: StreamID): Promise<GroupKeyQueue> {
        return this.groupKeyQueues.get(streamId)
    }

    private async createMessageFactory(streamId: StreamID): Promise<MessageFactory> {
        return new MessageFactory({
            streamId,
            authentication: this.authentication,
            streamRegistry: this.streamRegistry,
            groupKeyQueue: await this.groupKeyQueues.get(streamId),
            signatureValidator: this.signatureValidator,
            messageSigner: this.messageSigner
        })
    }
}
