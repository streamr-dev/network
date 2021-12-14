#!/usr/bin/env node
import { createFnParseInt } from './common'
import { createClientCommand } from '../src/command'
import StreamrClient from 'streamr-client'

createClientCommand(async (client: StreamrClient, streamId: string, options: any) => {
    await client.subscribe({
        streamId,
        streamPartition: options.partition,
    }, (message) => console.info(JSON.stringify(message)))
}, (options) => ({
    orderMessages: !options.disableOrdering
}))
    .arguments('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .parseAsync()