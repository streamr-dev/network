#!/usr/bin/env node
import '../src/logLevel'
import StreamrClient from 'streamr-client'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { createFnParseInt } from '../src/common'

interface Options extends BaseOptions {
    partition: number
    disableOrdering: boolean
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    await client.subscribe({
        streamId,
        partition: options.partition,
    }, (message) => console.info(JSON.stringify(message)))
}, {
    autoDestroyClient: false,
    clientOptionsFactory: (options) => ({
        orderMessages: !options.disableOrdering
    })
})
    .arguments('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .parseAsync()
