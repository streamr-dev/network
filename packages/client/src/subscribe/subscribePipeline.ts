/**
 * Subscription message processing pipeline
 */
import {
    StreamMessage,
    StreamMessageError,
    StreamPartID
} from '@streamr/protocol'
import { OrderMessages } from './OrderMessages'
import { MessageStream } from './MessageStream'
import { Validator } from '../Validator'
import { decrypt } from '../encryption/decrypt'
import { StrictStreamrClientConfig } from '../Config'
import { Resends } from './Resends'
import { DestroySignal } from '../DestroySignal'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { MsgChainUtil } from './MsgChainUtil'
import { LoggerFactory } from '../utils/LoggerFactory'
import { GroupKeyManager } from '../encryption/GroupKeyManager'

export interface SubscriptionPipelineOptions {
    streamPartId: StreamPartID
    loggerFactory: LoggerFactory
    resends: Resends
    groupKeyManager: GroupKeyManager
    streamRegistryCached: StreamRegistryCached
    destroySignal: DestroySignal
    config: StrictStreamrClientConfig
}

export const createSubscribePipeline = (opts: SubscriptionPipelineOptions): MessageStream => {

    const logger = opts.loggerFactory.createLogger(module)

    const validate = new Validator(
        opts.streamRegistryCached
    )

    const gapFillMessages = new OrderMessages(
        opts.config,
        opts.resends,
        opts.streamPartId,
        opts.loggerFactory
    )

    /* eslint-enable object-curly-newline */

    const onError = async (error: Error | StreamMessageError, streamMessage?: StreamMessage) => {
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
        await validate.validate(msg)
        if (StreamMessage.isAESEncrypted(msg)) {
            try {
                return decrypt(msg, opts.groupKeyManager, opts.destroySignal)
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
    messageStream
        // order messages (fill gaps)
        .pipe(gapFillMessages.transform())
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
        .forEach(async (streamMessage: StreamMessage) => {
            streamMessage.getParsedContent()
        })
        // ignore any failed messages
        .filter(async (streamMessage: StreamMessage) => {
            return !ignoreMessages.has(streamMessage)
        })
        .onBeforeFinally.listen(async () => {
            const tasks = [
                gapFillMessages.stop(),
                validate.stop(),
            ]
            await Promise.allSettled(tasks)
        })
    return messageStream
}
