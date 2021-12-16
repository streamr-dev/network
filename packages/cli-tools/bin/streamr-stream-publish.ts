#!/usr/bin/env node
import { Writable } from 'stream'
import { StreamrClient } from 'streamr-client'
import { wait } from 'streamr-test-utils'
import es from 'event-stream'
import { createClientCommand } from '../src/command'

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
    return writable
}

createClientCommand(async (client: StreamrClient, streamId: string, options: any) => {
    const ps = publishStream(streamId, options.partitionKey, client)
    return new Promise((resolve, reject) => {
        process.stdin
            .pipe(es.split())
            .pipe(ps)
            .once('finish', async () => {
                // We need to wait some time because the client.publish() may resolve the promise
                // before the node has propagated the message. That may happend if the node
                // has not yet connected to Tracker when client.publish() is called. In that case
                // the message is put to the propagation queue (activeTaskStore.add call in
                // network Propagation.ts:59) and the client.publish() promise resolves immeditatelly.
                // TODO Remove this wait when NET-604 has been resolved
                await wait(2000)
                resolve(undefined)
            })
            .once('error', (err: any) => reject(err) )
    })
})
    .arguments('<streamId>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line')
    .option('-k, --partition-key <string>', 'field name in each message to use for assigning the message to a stream partition')
    .parseAsync()