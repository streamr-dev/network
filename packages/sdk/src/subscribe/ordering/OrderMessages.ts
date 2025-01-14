import { EthereumAddress, StreamID, StreamPartID, StreamPartIDUtils, UserID, executeSafePromise } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../../Config'
import { StreamMessage } from '../../protocol/StreamMessage'
import { createLazyMap, Mapping } from '../../utils/Mapping'
import { PushBuffer } from '../../utils/PushBuffer'
import { Resends } from '../Resends'
import { GapFiller } from './GapFiller'
import { Gap, OrderedMessageChain, OrderedMessageChainContext } from './OrderedMessageChain'

const createMessageChain = (
    context: OrderedMessageChainContext,
    getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
    onUnfillableGap: (gap: Gap) => void,
    resends: Resends,
    config: Pick<
        StrictStreamrClientConfig,
        'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill' | 'gapFillStrategy'
    >,
    abortSignal: AbortSignal
) => {
    const resend = async function* (gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) {
        const msgs = await resends.resend(
            context.streamPartId,
            {
                from: {
                    timestamp: gap.from.getMessageRef().timestamp,
                    sequenceNumber: gap.from.getMessageRef().sequenceNumber + 1
                },
                to: gap.to.prevMsgRef!,
                publisherId: context.publisherId,
                msgChainId: context.msgChainId,
                raw: true
            },
            async () => [storageNodeAddress],
            abortSignal
        )
        yield* msgs
    }
    const chain = new OrderedMessageChain(context, abortSignal)
    chain.on('unfillableGap', (gap: Gap) => onUnfillableGap(gap))
    const gapFiller = new GapFiller({
        chain,
        resend,
        getStorageNodeAddresses: () => getStorageNodes(StreamPartIDUtils.getStreamID(context.streamPartId)),
        strategy: config.gapFillStrategy,
        initialWaitTime: config.gapFillTimeout,
        retryWaitTime: config.retryResendAfter,
        maxRequestsPerGap: config.gapFill ? config.maxGapRequests : 0,
        abortSignal
    })
    gapFiller.start()
    return chain
}

/**
 * Manages message ordering and gap filling (per stream part). Provides an iterator
 * to read the sequence of messages which are in ascending order and gaps are filled
 * (if enabled, and the missing message available in a storage node)
 */
export class OrderMessages {
    private readonly chains: Mapping<[UserID, string], OrderedMessageChain>
    private readonly outBuffer = new PushBuffer<StreamMessage>()
    private readonly abortController = new AbortController()

    constructor(
        streamPartId: StreamPartID,
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
        onUnfillableGap: (gap: Gap) => void,
        resends: Resends,
        config: Pick<
            StrictStreamrClientConfig,
            'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill' | 'gapFillStrategy'
        >
    ) {
        this.chains = createLazyMap({
            valueFactory: async ([publisherId, msgChainId]) => {
                const chain = createMessageChain(
                    {
                        streamPartId,
                        publisherId,
                        msgChainId
                    },
                    getStorageNodes,
                    onUnfillableGap,
                    resends,
                    config,
                    this.abortController.signal
                )
                chain.on('orderedMessageAdded', (msg: StreamMessage) => this.onOrdered(msg))
                return chain
            }
        })
    }

    private onOrdered(orderedMessage: StreamMessage): void {
        if (!this.outBuffer.isDone()) {
            executeSafePromise(() => this.outBuffer.push(orderedMessage))
        }
    }

    destroy(): void {
        this.outBuffer.endWrite()
        this.abortController.abort()
    }

    async addMessages(src: AsyncGenerator<StreamMessage>): Promise<void> {
        try {
            for await (const msg of src) {
                if (this.abortController.signal.aborted) {
                    return
                }
                const chain = await this.chains.get([msg.getPublisherId(), msg.getMsgChainId()])
                chain.addMessage(msg)
            }
            await Promise.all([...this.chains.values()].map((chain) => chain.waitUntilIdle()))
            this.outBuffer.endWrite()
        } catch (err) {
            this.outBuffer.endWrite(err)
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage> {
        return this.outBuffer
    }
}
