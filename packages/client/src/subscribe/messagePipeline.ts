/**
 * Subscription message processing pipeline
 */
import {
    StreamID,
    StreamMessage,
    StreamMessageError,
    StreamPartID
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { decrypt } from '../encryption/decrypt'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { MessageStream } from './MessageStream'
import { MsgChainUtil } from './MsgChainUtil'
import { OrderMessages } from './OrderMessages'
import { Resends } from './Resends'

export interface MessagePipelineOptions {
    streamPartId: StreamPartID
    disableMessageOrdering?: boolean
    getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>
    resends: Resends
    groupKeyManager: GroupKeyManager
    streamRegistryCached: StreamRegistryCached
    destroySignal: DestroySignal
    loggerFactory: LoggerFactory
    config: Pick<StrictStreamrClientConfig, 'orderMessages' | 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>
}

export const createMessagePipeline = (opts: MessagePipelineOptions): MessageStream => {

    const logger = opts.loggerFactory.createLogger(module)

    /* eslint-enable object-curly-newline */

    const onError = (error: Error | StreamMessageError, streamMessage?: StreamMessage) => {
        if (streamMessage) {
            ignoreMessages.add(streamMessage)
        }

        if (error && 'streamMessage' in error && error.streamMessage) {
            ignoreMessages.add(error.streamMessage)
        }

        throw error
    }

    const messageStream = new MessageStream()
    const msgChainUtil = new MsgChainUtil(async (msg) => {
        await validateStreamMessage(msg, opts.streamRegistryCached)
        if (StreamMessage.isAESEncrypted(msg)) {
            try {
                return await decrypt(msg, opts.groupKeyManager, opts.destroySignal)
            } catch (err) {
                // TODO log this in onError? if we want to log all errors?
                logger.debug('Failed to decrypt', { messageId: msg.getMessageID(), err })
                // clear cached permissions if cannot decrypt, likely permissions need updating
                opts.streamRegistryCached.clearStream(msg.getStreamId())
                throw err
            }    
        } else {
            return msg
        }
    }, messageStream.onError)

    // collect messages that fail validation/parsixng, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()
    messageStream.onError.listen(onError)
    if (opts.config.orderMessages && (opts.disableMessageOrdering !== true)) {
        // order messages (fill gaps)
        const orderMessages = new OrderMessages(
            opts.config,
            opts.resends,
            opts.streamPartId,
            opts.loggerFactory,
            opts.getStorageNodes
        )
        messageStream.pipe(orderMessages.transform())
        messageStream.onBeforeFinally.listen(() => {
            orderMessages.stop()
        })
    }
    messageStream
        // validate & decrypt
        .pipe(async function* (src: AsyncGenerator<StreamMessage>) {
            setImmediate(async () => {
                for await (const msg of src) {
                    msgChainUtil.addMessage(msg)
                }
                await msgChainUtil.flush()
                msgChainUtil.stop()
            })
            yield* msgChainUtil
        })
        // parse content
        .forEach((streamMessage: StreamMessage) => {
            streamMessage.getParsedContent()
        })
        // ignore any failed messages
        .filter((streamMessage: StreamMessage) => {
            return !ignoreMessages.has(streamMessage)
        })
    return messageStream
}
