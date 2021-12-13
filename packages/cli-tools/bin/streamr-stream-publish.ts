#!/usr/bin/env node
import { Writable } from 'stream'
import { StreamrClient } from 'streamr-client'
import es from 'event-stream'
import { getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

const publishStream = (
    stream: string,
    partitionKey: string | undefined,
    client: StreamrClient
): Writable => {
    const writable = new Writable({
        objectMode: true,
        write: (data: any, _: any, done: any) => {
            let json = null
            // ignore newlines, etc
            if (!data || String(data).trim() === '') {
                done()
                return
            }
            try {
                json = JSON.parse(data)
            } catch (e) {
                console.error(data.toString())
                done(e)
                return
            }
            // @ts-expect-error TODO: the last argument here looks wrong, should be just `partitionKey`?
            client.publish(stream, json, Date.now(), json[partitionKey]).then(
                () => done(),
                (err) => done(err)
            )
        }
    })

    // destroy client when upstream pipe ends and data flushed
    writable.once('finish', () => client.destroy())
    return writable
}

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