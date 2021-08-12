import { wait } from 'streamr-test-utils'
import { startTracker, Tracker } from 'streamr-network'
import { StreamMessage, SIDLike, SPID } from 'streamr-client-protocol'

import { Msg } from '../../utils'
import { counterId, Scaffold } from '../../../src/utils'
import { BrubeckClient } from '../../../src/BrubeckClient'
import { PublishMetadata } from '../../../src/Publisher'
import { StreamProperties } from '../../../src/Stream'
import { Pipeline } from '../../../src/utils/Pipeline'

type PublishManyOpts = Partial<{
    delay: number,
    timestamp: number | (() => number)
    sequenceNumber: number | (() => number)
}>

export async function* publishManyGenerator(
    total: number = 5,
    opts: PublishManyOpts = {}
): AsyncGenerator<PublishMetadata<any>> {
    const { delay = 10, sequenceNumber, timestamp } = opts
    const batchId = counterId('publishMany')
    for (let i = 0; i < total; i++) {
        yield {
            timestamp: typeof timestamp === 'function' ? timestamp() : timestamp,
            sequenceNumber: typeof sequenceNumber === 'function' ? sequenceNumber() : sequenceNumber,
            content: Msg({
                batchId,
                value: `${i + 1} of ${total}`
            })
        }

        if (delay) {
            // eslint-disable-next-line no-await-in-loop
            await wait(delay)
        }
    }
}

type PublishTestMessageOptions = PublishManyOpts & {
    waitForLast?: boolean
    waitForLastCount?: number
    retainMessages?: boolean
}

export function publishTestMessagesGenerator(client: BrubeckClient, stream: SIDLike, maxMessages: number = 5, opts: PublishTestMessageOptions = {}) {
    const sid = SPID.parse(stream)
    const source = publishManyGenerator(maxMessages, opts)
    return new Pipeline<StreamMessage>(client.publisher.publishFromMetadata(sid, source))
}

export function getPublishTestStreamMessages(client: BrubeckClient, stream: SIDLike, defaultOpts: PublishTestMessageOptions = {}) {
    const sid = SPID.parse(stream)
    return async (maxMessages: number = 5, opts: PublishTestMessageOptions = {}) => {
        const {
            waitForLast,
            waitForLastCount,
            retainMessages = true,
            ...options
        } = {
            ...defaultOpts,
            ...opts,
        }
        const publishStream = publishTestMessagesGenerator(client, sid, maxMessages, options)
        const streamMessages = []
        let count = 0
        for await (const streamMessage of publishStream) {
            count += 1
            if (!retainMessages) {
                streamMessages.length = 0 // only keep last message
            }
            streamMessages.push(streamMessage)
            if (count === maxMessages) {
                break
            }
        }
        streamMessages.forEach((s) => s.getParsedContent())
        if (!waitForLast) {
            return streamMessages
        }

        await getWaitForStorage(client, {
            count: waitForLastCount
        })(streamMessages[streamMessages.length - 1])
        return streamMessages
    }
}

export function getPublishTestMessages(client: BrubeckClient, stream: SIDLike, defaultOpts: PublishTestMessageOptions = {}) {
    const sid = SPID.parse(stream)
    const publishTestStreamMessages = getPublishTestStreamMessages(client, sid, defaultOpts)
    return async (maxMessages: number = 5, opts: PublishTestMessageOptions = {}) => {
        const streamMessages = await publishTestStreamMessages(maxMessages, opts)
        return streamMessages.map((s) => s.getParsedContent())
    }
}

export function getWaitForStorage(client: BrubeckClient, defaultOpts = {}) {
    return async (lastPublished: StreamMessage, opts = {}) => {
        return client.publisher.waitForStorage(lastPublished, {
            ...defaultOpts,
            ...opts,
        })
    }
}

// eslint-disable-next-line no-undef
const getTestName = (module: NodeModule) => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

// eslint-disable-next-line no-undef
export const createRelativeTestStreamId = (module: NodeModule, suffix?: string) => {
    return counterId(`/test/${process.pid}/${getTestName(module)}${(suffix !== undefined) ? '-' + suffix : ''}`, '-')
}

// eslint-disable-next-line no-undef
export const createTestStream = (streamrClient: BrubeckClient, module: NodeModule, props?: Partial<StreamProperties>) => {
    return streamrClient.createStream({
        id: createRelativeTestStreamId(module),
        ...props
    })
}

function initTracker() {
    const trackerPort = 30304 + (process.pid % 1000)
    let counter = 0
    let tracker: Tracker
    const update = Scaffold([
        async () => {
            tracker = await startTracker({
                host: '127.0.0.1',
                port: trackerPort,
                id: `tracker${trackerPort}`
            })

            return async () => {
                await tracker.stop()
            }
        }
    ], () => counter > 0)

    return {
        trackerPort,
        async up() {
            counter += 1
            return update()
        },
        async down() {
            counter = Math.max(0, counter - 1)
            return update()
        }
    }
}

export function useTracker() {
    const { up, down, trackerPort } = initTracker()
    beforeEach(up)
    afterEach(down)
    return trackerPort
}
