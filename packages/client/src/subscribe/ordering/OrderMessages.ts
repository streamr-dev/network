import { StreamID, StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../../Config'
import { Mapping } from '../../utils/Mapping'
import { PushBuffer } from '../../utils/PushBuffer'
import { CacheAsyncFn } from '../../utils/caches'
import { Resends } from '../Resends'
import { GapFiller } from './GapFiller'
import { Gap, OrderedMessageChain, OrderedMessageChainContext } from './OrderedMessageChain'

const createMessageChain = (
    context: OrderedMessageChainContext,
    getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
    resends: Resends,
    config: Pick<StrictStreamrClientConfig, 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>,
    abortSignal: AbortSignal
) => {
    const resend = async function*(gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) {
        const msgs = await resends.resend(context.streamPartId, {
            from: {
                timestamp: gap.from.getMessageRef().timestamp,
                sequenceNumber: gap.from.getMessageRef().sequenceNumber + 1,
            },
            to: gap.to.getPreviousMessageRef()!,
            publisherId: context.publisherId,
            msgChainId: context.msgChainId,
            raw: true
        }, async () => [storageNodeAddress], abortSignal)
        yield* msgs
    }
    const chain = new OrderedMessageChain(context, abortSignal)
    const gapFiller = new GapFiller({
        chain,
        resend,
        // TODO maybe caching should be configurable? (now uses 30 min maxAge, which is the default of CacheAsyncFn)
        // - maybe the caching should be done at application level, e.g. with a new CacheStreamStorageRegistry class?
        // - also not that this is a cache which contains just one item (as streamPartId always the same)
        getStorageNodeAddresses: CacheAsyncFn(() => getStorageNodes(StreamPartIDUtils.getStreamID(context.streamPartId))),
        initialWaitTime: config.gapFillTimeout,
        retryWaitTime: config.retryResendAfter,
        maxRequestsPerGap: (config.gapFill) ? config.maxGapRequests : 0,
        abortSignal
    })
    gapFiller.start()
    return chain
}

/**
 * Implements gap filling
 */
export class OrderMessages {

    private readonly chains: Mapping<[EthereumAddress, string], OrderedMessageChain>
    private readonly outBuffer = new PushBuffer<StreamMessage>()
    private readonly abortController = new AbortController()

    constructor(
        streamPartId: StreamPartID,
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
        resends: Resends,
        config: Pick<StrictStreamrClientConfig, 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>,
    ) {
        this.chains = new Mapping(async (publisherId: EthereumAddress, msgChainId: string) => {
            const chain = createMessageChain(
                {
                    streamPartId, 
                    publisherId, 
                    msgChainId
                },
                getStorageNodes,
                resends,
                config,
                this.abortController.signal
            )
            chain.on('orderedMessageAdded', (msg: StreamMessage) => this.onOrdered(msg))
            return chain
        })
    }

    private onOrdered(orderedMessage: StreamMessage): void {
        if (!this.outBuffer.isDone()) {
            this.outBuffer.push(orderedMessage)
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
                const chain = await this.chains.get(msg.getPublisherId(), msg.getMsgChainId())
                chain.addMessage(msg)
            }
            await Promise.all(this.chains.values().map((chain) => chain.waitUntilIdle()))
            this.outBuffer.endWrite()
        } catch (err) {
            this.outBuffer.endWrite(err)
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage> {
        return this.outBuffer
    }
}
