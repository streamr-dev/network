import { toStreamPartID } from '@streamr/protocol'
import { Logger, collect, wait } from '@streamr/utils'
import { Message } from '../Message'
import { StreamrClientError } from '../StreamrClientError'
import { Resends } from './Resends'

const logger = new Logger(module)

export const waitForStorage = async (
    message: Message,
    opts: {
        interval: number
        timeout: number
        count: number
        messageMatchFn: (msgTarget: Message, msgGot: Message) => boolean
    },
    resends: Resends
): Promise<void> => {
    if (!message) {
        throw new StreamrClientError('waitForStorage requires a Message', 'INVALID_ARGUMENT')
    }
    const start = Date.now()
    let last: Message[] | undefined
    let found = false
    while (!found) {
        const duration = Date.now() - start
        if (duration > opts.timeout) {
            logger.debug('Timed out waiting for storage to contain message', {
                expected: message.streamMessage.getMessageID(),
                lastReceived: last?.map((l) => l.streamMessage.getMessageID()),
            })
            throw new Error(`timed out after ${duration}ms waiting for message`)
        }
        const resendStream = await resends.resend(toStreamPartID(message.streamId, message.streamPartition), { last: opts.count })
        last = await collect(resendStream)
        for (const lastMsg of last) {
            if (opts.messageMatchFn(message, lastMsg)) {
                found = true
                logger.debug('Found matching message')
                return
            }
        }
        logger.debug('Retry after delay (matching message not found)', {
            expected: message.streamMessage.getMessageID(),
            'last-3': last.slice(-3).map((l) => l.streamMessage.getMessageID()),
            delayInMs: opts.interval
        })
        await wait(opts.interval)
    }
    /* eslint-enable no-await-in-loop */
}
