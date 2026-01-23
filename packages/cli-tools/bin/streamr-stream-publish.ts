#!/usr/bin/env node
import '../src/logLevel'

import { convertBytesToStreamMessage, type PublishMetadata, type StreamMessage, StreamrClient } from '@streamr/sdk'
import { hexToBinary, LengthPrefixedFrameDecoder, merge, toEthereumAddress, toStreamID, wait } from '@streamr/utils'
import es from 'event-stream'
import { Writable } from 'stream'
import { Options as BaseOptions, createClientCommand } from '../src/command'
import { createFnParseInt } from '../src/common'

interface Options extends BaseOptions {
    partition?: number
    partitionKeyField?: string
    raw: boolean
    withMetadata: boolean
    binary: boolean
}

const isHexadecimal = (str: string): boolean => {
    return /^[0-9a-fA-F]+$/.test(str)
}

const publishStream = async (
    streamId: string,
    partition: number | undefined,
    partitionKeyField: string | undefined,
    raw: boolean,
    withMetadata: boolean,
    binary: boolean,
    client: StreamrClient
): Promise<Writable> => {
    const fullStreamId = toStreamID(streamId, toEthereumAddress(await client.getAddress()))
    const writable = new Writable({
        objectMode: true,
        write: (data: any, _: any, done: any) => {
            let content: any
            let metadata: PublishMetadata
            let streamMessage: StreamMessage | undefined = undefined
            if (binary) {
                if (withMetadata) {
                    streamMessage = convertBytesToStreamMessage(data)
                    content = streamMessage.content
                    metadata = {
                        timestamp: streamMessage.getTimestamp(),
                        msgChainId: streamMessage.getMsgChainId()
                    }
                } else {
                    content = data
                    metadata = {}
                }
            } else {
                // ignore newlines, etc
                if (!data || String(data).trim() === '') {
                    done()
                    return
                }
                const trimmedData = String(data).trim()
                try {
                    if (withMetadata) {
                        const payload = JSON.parse(trimmedData)
                        if (payload.content === undefined) {
                            throw new Error('invalid input: no content')
                        }
                        content = isHexadecimal(payload.content) ? hexToBinary(payload.content) : payload.content
                        metadata = payload.metadata ?? {}
                    } else {
                        content = isHexadecimal(trimmedData) ? hexToBinary(trimmedData) : JSON.parse(trimmedData)
                        metadata = {}
                    }
                } catch (e) {
                    console.error(data.toString())
                    done(e)
                    return
                }
            }
            if (raw) {
                if (streamMessage!.getStreamId() !== fullStreamId) {
                    throw new Error(`invalid input: stream IDs don't match: expected=${fullStreamId}, actual=${streamMessage!.getStreamId()}`)
                }
                client.publishRaw(streamMessage!).then(
                    () => done(),
                    (err) => done(err)
                )
            } else {
                const partitionKey = (partitionKeyField !== undefined && typeof content === 'object') ? content[partitionKeyField] : undefined
                client.publish({ streamId, partition }, content, merge(metadata, { partitionKey })).then(
                    () => done(),
                    (err) => done(err)
                )
            }
        }
    })
    return writable
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    if ((options.partition !== undefined) && (options.partitionKeyField !== undefined)) {
        console.error('Invalid combination of "partition" and "partition-key-field"')
        process.exit(1)
    }
    if (options.raw) {
        if (!options.binary || !options.withMetadata) {
            console.error('raw publish not supported when publishing without metadata and binary')
            process.exit(1)
        }
        if (options.partitionKeyField !== undefined) {
            console.error('partition key field not supported when publishing raw')
            process.exit(1)
        }
    }
    const ps = await publishStream(streamId, options.partition, options.partitionKeyField, options.raw, options.withMetadata, options.binary, client)
    return new Promise((resolve, reject) => {
        const inputStream = options.binary
            ? process.stdin.pipe(new LengthPrefixedFrameDecoder())
            : process.stdin.pipe(es.split())
        inputStream
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
            .once('error', (err: any) => reject(err) )
    })
})
    .arguments('<streamId>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line or hexadecimal strings for binary data')
    .option('-p, --partition <partition>', 'partition', createFnParseInt('--partition'))
    // eslint-disable-next-line max-len
    .option('-k, --partition-key-field <string>', 'field name in each message to use for assigning the message to a stream partition (only for JSON data)')
    .option('-r, --raw', 'publish raw', false)
    .option('-m, --with-metadata', 'each input contains both the content and the metadata', false)
    .option('-b, --binary', 'binary input using length-prefixed frames', false)
    .parseAsync()
