import { wait, merge } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { counterId } from '../../src/utils/utils'
import { StreamDefinition } from '../../src/types'
import { PublishMetadata } from '../../src/publish/Publisher'
import { uid } from './utils'
import { Message } from './../../src/Message'

export function Msg<T extends object = object>(opts?: T): any {
    return merge(
        {
            value: uid('msg')
        },
        opts
    )
}

type TestMessageOptions = Partial<{
    delay: number
    timestamp: number | (() => number)
    partitionKey: number | string | (() => number | string)
    createMessage: (content: any) => any
}>

export async function* createTestMessages(
    total: number = 5,
    opts: TestMessageOptions = {}
): AsyncGenerator<PublishMetadata & { content: any }> {
    const { delay = 10, timestamp, partitionKey, createMessage = Msg } = opts
    const batchId = counterId('createTestMessages')
    for (let i = 0; i < total; i++) {
        yield {
            timestamp: typeof timestamp === 'function' ? timestamp() : timestamp,
            partitionKey: typeof partitionKey === 'function' ? partitionKey() : partitionKey,
            content: createMessage({
                batchId,
                value: `${i + 1} of ${total}`,
                index: i,
                total
            })
        }

        if (delay) {
            await wait(delay)
        }
    }
}

type PublishTestMessageOptions = TestMessageOptions & {
    waitForLast?: boolean
    waitForLastCount?: number
    waitForLastTimeout?: number
    retainMessages?: boolean
    afterEach?: (msg: Message) => Promise<void> | void
}

export async function* publishTestMessagesGenerator(
    client: StreamrClient,
    streamDefinition: StreamDefinition,
    maxMessages = 5,
    opts: PublishTestMessageOptions = {}
): AsyncGenerator<Message> {
    const source = createTestMessages(maxMessages, opts)
    for await (const msg of source) {
        const published = await client.publish(streamDefinition, msg.content, {
            timestamp: msg.timestamp,
            partitionKey: msg.partitionKey
        })
        if (opts.afterEach) {
            await opts.afterEach(published)
        }
        yield published
    }
}

export function getPublishTestStreamMessages(
    client: StreamrClient,
    streamDefinition: StreamDefinition,
    defaultOpts: PublishTestMessageOptions = {}
): (maxMessages?: number, opts?: PublishTestMessageOptions) => Promise<Message[]> {
    return async (maxMessages: number = 5, opts: PublishTestMessageOptions = {}) => {
        const {
            waitForLast,
            waitForLastCount,
            waitForLastTimeout,
            retainMessages = true,
            ...options
        } = merge(defaultOpts, opts)

        const publishStream = publishTestMessagesGenerator(client, streamDefinition, maxMessages, options)
        let streamMessages = []
        let count = 0
        for await (const streamMessage of publishStream) {
            count += 1
            if (!retainMessages) {
                streamMessages = [] // only keep last message
            }
            streamMessages.push(streamMessage)
            if (count === maxMessages) {
                break
            }
        }

        if (waitForLast) {
            await getWaitForStorage(client, {
                count: waitForLastCount,
                timeout: waitForLastTimeout
            })(streamMessages[streamMessages.length - 1])
        }

        return streamMessages
    }
}

export function getWaitForStorage(
    client: StreamrClient,
    defaultOpts = {}
): (
    lastPublished: Message,
    opts?: {
        interval?: number
        timeout?: number
        count?: number
        messageMatchFn?: (msgTarget: Message, msgGot: Message) => boolean
    }
) => Promise<void> {
    return async (lastPublished: Message, opts = {}) => {
        return client.waitForStorage(lastPublished, merge(defaultOpts, opts))
    }
}
