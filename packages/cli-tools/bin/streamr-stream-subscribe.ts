#!/usr/bin/env node
require('../src/logLevel')
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'
import { createFnParseInt } from '../src/common'

createClientCommand(async (client: StreamrClient, streamId: string, options: any) => {
    await client.subscribe({
        streamId,
        streamPartition: options.partition,
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