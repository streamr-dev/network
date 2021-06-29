import { wait } from 'streamr-test-utils'
import { Msg } from '../../utils'
import { counterId, Scaffold } from '../../../src/utils'
import { BrubeckClient } from '../../../src/brubeck/BrubeckClient'
import { StreamPartDefinitionOptions } from '../../../src/stream'
import { startTracker, Tracker } from 'streamr-network'
import { validateOptions } from '../../../src/stream/utils'

type PublishManyOpts = Partial<{
    delay: number,
}>

export async function* publishManyGenerator(total: number, opts: PublishManyOpts = {}) {
    const { delay = 10 } = opts
    const batchId = counterId('publishMany')
    for (let i = 0; i < total; i++) {
        yield {
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

export function getPublishTestMessages(client: BrubeckClient, stream: StreamPartDefinitionOptions, opts = {}) {
    return async (maxMessages: number) => {
        const streamOptions = validateOptions(stream)
        const source = publishManyGenerator(maxMessages, opts)
        const msgs = await client.publisher.collect(client.publisher.publishFrom(streamOptions, source), maxMessages)
        return msgs.map((s) => s.getParsedContent())
    }
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
