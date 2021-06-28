import { wait } from 'streamr-test-utils'
import { Msg } from '../../utils'
import { counterId } from '../../../src/utils'
import { BrubeckClient } from '../../../src/brubeck/BrubeckClient'
import { StreamPartDefinitionOptions } from '../../../src/stream'
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
    return (maxMessages: number) => {
        const streamOptions = validateOptions(stream)
        const source = publishManyGenerator(maxMessages, opts)
        return client.publisher.collect(client.publisher.publishFrom(streamOptions, source), maxMessages)
    }
}
