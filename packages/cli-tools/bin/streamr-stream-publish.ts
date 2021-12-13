#!/usr/bin/env node
import es from 'event-stream'
import { publishStream } from '../src/publish'
import { getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line')
    .option('-k, --partition-key <string>', 'field name in each message to use for assigning the message to a stream partition')
    .action((streamIdOrPath: string, options: any) => {
        const streamId = getStreamId(streamIdOrPath, options)!
        const client = createClient(options)
        const ps = publishStream(streamId, options.partitionKey, client)
        process.stdin
            .pipe(es.split())
            .pipe(ps)
            .on('error', (err: any) => {
                console.error(err)
                process.exit(1)
                // process.stdin.pipe(ps) recover pipe to continue execution
            })
    })
    .parse()