#!/usr/bin/env node
import '../src/logLevel'

import { Writable } from 'stream'
import { StreamrClient } from '@streamr/sdk'
import { hexToBinary, wait } from '@streamr/utils'
import es from 'event-stream'
import { createClientCommand, Options as BaseOptions } from '../src/command'

interface Options extends BaseOptions {
    partitionKeyField?: string
}

const isHexadecimal = (str: string): boolean => {
    return /^[0-9a-fA-F]+$/.test(str)
}

const publishStream = (stream: string, partitionKeyField: string | undefined, client: StreamrClient): Writable => {
    const writable = new Writable({
        objectMode: true,
        write: (data: any, _: any, done: any) => {
            let message = null
            // ignore newlines, etc
            if (!data || String(data).trim() === '') {
                done()
                return
            }
            const trimmedData = String(data).trim()
            if (isHexadecimal(trimmedData)) {
                message = hexToBinary(trimmedData)
            } else {
                try {
                    message = JSON.parse(trimmedData)
                } catch (e) {
                    console.error(data.toString())
                    done(e)
                    return
                }
            }
            const partitionKey =
                partitionKeyField !== undefined && typeof message === 'object' ? message[partitionKeyField] : undefined
            client.publish(stream, message, { partitionKey }).then(
                () => done(),
                (err) => done(err)
            )
        }
    })
    return writable
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    const ps = publishStream(streamId, options.partitionKeyField, client)
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
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            .once('error', (err: any) => reject(err))
    })
})
    .arguments('<streamId>')
    .description(
        'publish to a stream by reading JSON messages from stdin line-by-line or hexadecimal strings for binary data'
    )
    .option(
        '-k, --partition-key-field <string>',
        'field name in each message to use for assigning the message to a stream partition (only for JSON data)'
    )
    .parseAsync()
