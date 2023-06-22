import { StreamID, StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../Config'
import { Mapping } from '../utils/Mapping'
import { PushBuffer } from '../utils/PushBuffer'
import { CacheAsyncFn } from '../utils/caches'
import { Resends } from './Resends'
import { Gap } from './ordering/OrderedMessageChain'
import { GapFilledMessageChain } from './ordering/GapFilledMessageChain'

const createMessageChain = (
    streamPartId: StreamPartID,
    publisherId: EthereumAddress,
    msgChainId: string,
    getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
    resends: Resends,
    config: Pick<StrictStreamrClientConfig, 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>,
) => {
    const resend = async function*(gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) {
        const msgs = await resends.resend(streamPartId, {
            from: {
                timestamp: gap.from.getMessageRef().timestamp,
                sequenceNumber: gap.from.getMessageRef().sequenceNumber + 1,
            },
            to: gap.to.getPreviousMessageRef()!,
            publisherId,
            msgChainId,
            raw: true
        }, async () => [storageNodeAddress], abortSignal)
        yield* msgs
    }
    return new GapFilledMessageChain({
        streamPartId,
        resend,
        // TODO maybe caching should be configurable? (now uses 30 min maxAge, which is the default of CacheAsyncFn)
        // - maybe the caching should be done at application level, e.g. with a new CacheStreamStorageRegistry class?
        // - also not that this is a cache which contains just one item (as streamPartId always the same)
        getStorageNodeAddresses: CacheAsyncFn(() => getStorageNodes(StreamPartIDUtils.getStreamID(streamPartId))),
        initialWaitTime: config.gapFillTimeout,
        retryWaitTime: config.retryResendAfter,
        maxRequestsPerGap: (config.gapFill) ? config.maxGapRequests : 0,
    })
}

/**
 * Implements gap filling
 */
export class OrderMessages {

    private readonly chains: Mapping<[EthereumAddress, string], GapFilledMessageChain>
    private readonly outBuffer = new PushBuffer<StreamMessage>()
    private isDestroyed = false

    constructor(
        streamPartId: StreamPartID,
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
        resends: Resends,
        config: Pick<StrictStreamrClientConfig, 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>,
    ) {
        this.chains = new Mapping(async (publisherId: EthereumAddress, msgChainId: string) => {
            const chain = createMessageChain(
                streamPartId, 
                publisherId, 
                msgChainId,
                getStorageNodes,
                resends,
                config
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
        this.isDestroyed = true
        this.outBuffer.endWrite()
        for (const chain of this.chains.values()) {
            chain.destroy()
        }
    }

    async addMessages(src: AsyncGenerator<StreamMessage>): Promise<void> {
        try {
            for await (const msg of src) {
                if (this.isDestroyed) {
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
