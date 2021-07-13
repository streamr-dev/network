import { wait } from 'streamr-test-utils'
import { StreamMessage } from 'streamr-client-protocol'
import { Msg } from '../../utils'
import { counterId, Scaffold } from '../../../src/utils'
import { BrubeckClient } from '../../../src/brubeck/BrubeckClient'
import { StreamPartDefinitionOptions } from '../../../src/stream'
import { startTracker, Tracker } from 'streamr-network'
import { validateOptions } from '../../../src/stream/utils'
import { inspect } from '../../../src/utils/log'

type PublishManyOpts = Partial<{
    delay: number,
    timestamp: number | (() => number)
    sequenceNumber: number | (() => number)
}>

export async function* publishManyGenerator(total: number = 5, opts: PublishManyOpts = {}) {
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

export function getPublishTestStreamMessages(client: BrubeckClient, stream: StreamPartDefinitionOptions, defaultOpts: PublishManyOpts = {}) {
    return async (maxMessages: number = 5, opts: PublishManyOpts = {}) => {
        const streamOptions = validateOptions(stream)
        const source = publishManyGenerator(maxMessages, {
            ...defaultOpts,
            ...opts,
        })
        return client.publisher.collect(client.publisher.publishFromMetadata(streamOptions, source), maxMessages)
    }
}

export function getPublishTestMessages(client: BrubeckClient, stream: StreamPartDefinitionOptions, defaultOpts: PublishManyOpts = {}) {
    return async (maxMessages: number = 5, opts: PublishManyOpts = {}) => {
        const streamOptions = validateOptions(stream)
        const source = publishManyGenerator(maxMessages, {
            ...defaultOpts,
            ...opts,
        })
        const msgs = await client.publisher.collect(client.publisher.publishFromMetadata(streamOptions, source), maxMessages)
        return msgs.map((s) => s.getParsedContent())
    }
}

function defaultMessageMatchFn(msgTarget: StreamMessage, msgGot: StreamMessage) {
    if (msgTarget.signature) {
        // compare signatures by default
        return msgTarget.signature === msgGot.signature
    }
    return JSON.stringify(msgGot.getParsedContent()) === JSON.stringify(msgTarget.getParsedContent())
}

export function getWaitForStorage(client: BrubeckClient, defaultOpts = {}) {
    /* eslint-disable no-await-in-loop */
    return async (lastPublished: any, opts = {}) => {
        const {
            streamId,
            streamPartition = 0,
            interval = 500,
            timeout = 10000,
            count = 100,
            messageMatchFn = defaultMessageMatchFn
        } = validateOptions({
            ...defaultOpts,
            ...opts,
        })

        if (!lastPublished) {
            throw new Error(`should check against lastPublished StreamMessage for comparison, got: ${inspect(lastPublished)}`)
        }

        const start = Date.now()
        let last: any
        // eslint-disable-next-line no-constant-condition
        let found = false
        while (!found) {
            const duration = Date.now() - start
            if (duration > timeout) {
                client.debug('waitForStorage timeout %o', {
                    timeout,
                    duration
                }, {
                    lastPublished,
                    last: last!.map((l: any) => l.content),
                })
                const err: any = new Error(`timed out after ${duration}ms waiting for message: ${inspect(lastPublished)}`)
                err.publishRequest = lastPublished
                throw err
            }

            last = await client.client.getStreamLast({
                // @ts-expect-error
                streamId,
                streamPartition,
                count,
            })

            for (const lastMsg of last) {
                if (messageMatchFn(lastPublished, lastMsg)) {
                    found = true
                    return
                }
            }

            client.debug('message not found, retrying... %o', {
                msg: lastPublished.getParsedContent(),
                last: last.map(({ content }: any) => content)
            })

            await wait(interval)
        }
    }
    /* eslint-enable no-await-in-loop */
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
