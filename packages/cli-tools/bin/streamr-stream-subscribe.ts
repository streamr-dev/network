#!/usr/bin/env node
import { subscribe } from '../src/subscribe'
import { createFnParseInt, getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((streamIdOrPath: string, options: any) => {
        const streamId = getStreamId(streamIdOrPath, options)!
        const client = createClient(options, {
            orderMessages: !options.disableOrdering
        })
        subscribe(streamId, options.partition, client)
    })
    .parse()