#!/usr/bin/env node
import { createFnParseInt, getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action(async (streamIdOrPath: string, options: any) => {
        const streamId = getStreamId(streamIdOrPath, options)!
        const client = createClient(options, {
            orderMessages: !options.disableOrdering
        })
        await client.subscribe({
            streamId,
            streamPartition: options.partition,
        }, (message) => console.info(JSON.stringify(message)))
    })
    .parseAsync()