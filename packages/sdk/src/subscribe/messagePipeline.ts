/**
 * Subscription message processing pipeline
 */
import { EthereumAddress, StreamID, StreamPartID } from '@streamr/utils'
import { StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { decrypt } from '../encryption/decrypt'
import { StreamMessage } from '../protocol/StreamMessage'

import { SignatureValidator } from '../signature/SignatureValidator'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushPipeline } from '../utils/PushPipeline'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { MsgChainUtil } from './MsgChainUtil'
import { Resends } from './Resends'
import { OrderMessages } from './ordering/OrderMessages'
import { StreamrClientError } from '../StreamrClientError'
import { MessageID } from '../protocol/MessageID'

export interface MessagePipelineOptions {
    streamPartId: StreamPartID
    getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>
    resends: Resends
    streamRegistry: StreamRegistry
    signatureValidator: SignatureValidator
    groupKeyManager: GroupKeyManager
    config: Pick<
        StrictStreamrClientConfig,
        'orderMessages' | 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill' | 'gapFillStrategy'
    >
    destroySignal: DestroySignal
    loggerFactory: LoggerFactory
}

export const createMessagePipeline = (opts: MessagePipelineOptions): PushPipeline<StreamMessage, StreamMessage> => {
    const logger = opts.loggerFactory.createLogger(module)

    const onError = (error: Error | StreamrClientError, streamMessage?: StreamMessage) => {
        if (streamMessage) {
            ignoreMessages.add(streamMessage.messageId)
        }

        if (error && 'messageId' in error && error.messageId) {
            ignoreMessages.add(error.messageId)
        }

        throw error
    }

    const messageStream = new PushPipeline<StreamMessage, StreamMessage>()
    const msgChainUtil = new MsgChainUtil(async (msg) => {
        await validateStreamMessage(msg, opts.streamRegistry, opts.signatureValidator)
        let decrypted
        if (StreamMessage.isAESEncrypted(msg)) {
            try {
                decrypted = await decrypt(msg, opts.groupKeyManager, opts.destroySignal)
            } catch (err) {
                // TODO log this in onError? if we want to log all errors?
                logger.debug('Failed to decrypt', { messageId: msg.messageId, err })
                // clear cached permissions if cannot decrypt, likely permissions need updating
                opts.streamRegistry.invalidatePermissionCaches(msg.getStreamId())
                throw err
            }
        } else {
            decrypted = msg
        }
        decrypted.getParsedContent() // throws if content is not parsable (e.g. not valid JSON)
        return decrypted
    }, messageStream.onError)

    // collect messages that fail validation/parsing, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet<MessageID>()
    messageStream.onError.listen(onError)
    if (opts.config.orderMessages) {
        // order messages and fill gaps
        const orderMessages = new OrderMessages(
            opts.streamPartId,
            opts.getStorageNodes,
            () => {}, // TODO send some error to messageStream (NET-987)
            opts.resends,
            opts.config
        )
        messageStream.pipe(async function* (src: AsyncGenerator<StreamMessage>) {
            setImmediate(() => {
                orderMessages.addMessages(src)
            })
            yield* orderMessages
        })
        messageStream.onBeforeFinally.listen(() => {
            orderMessages.destroy()
        })
    }
    messageStream
        .pipe(async function* (src: AsyncGenerator<StreamMessage>) {
            setImmediate(async () => {
                let err: Error | undefined = undefined
                try {
                    for await (const msg of src) {
                        msgChainUtil.addMessage(msg)
                    }
                } catch (e) {
                    err = e
                }
                await msgChainUtil.flush()
                msgChainUtil.stop(err)
            })
            yield* msgChainUtil
        })
        // ignore any failed messages
        .filter((streamMessage: StreamMessage) => {
            return !ignoreMessages.has(streamMessage.messageId)
        })
    return messageStream
}
