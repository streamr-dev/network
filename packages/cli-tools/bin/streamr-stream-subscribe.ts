#!/usr/bin/env node
import '../src/logLevel'

import { convertStreamMessageToBytes, type MessageMetadata, type StreamMessage, StreamrClient } from '@streamr/sdk'
import { binaryToHex, toLengthPrefixedFrame } from '@streamr/utils'
import mapValues from 'lodash/mapValues'
import isString from 'lodash/isString'
import omit from 'lodash/omit'
import { Options as BaseOptions, createClientCommand } from '../src/command'
import { createFnParseInt } from '../src/common'

interface Options extends BaseOptions {
    partition: number
    disableOrdering: boolean
    raw: boolean
    withMetadata: boolean
    binary: boolean
}

const withBinaryFieldsAsHex = (metadata: Record<string, any>) => {
    return mapValues(metadata, (value) => value instanceof Uint8Array ? binaryToHex(value) : value)
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    const sub = await client.subscribe({
        streamId,
        partition: options.partition,
        raw: options.raw
    })
    for await (const msg of sub) {
        if (options.binary) {
            // @ts-expect-error private field
            const streamMessage = msg.streamMessage as StreamMessage
            const binaryData = options.withMetadata    
                ? convertStreamMessageToBytes(streamMessage)
                : streamMessage.content
            process.stdout.write(toLengthPrefixedFrame(binaryData))
        } else {
            const formContent = (content: unknown) => content instanceof Uint8Array ? binaryToHex(content) : content
            const formMessage = options.withMetadata
                ? (content: unknown, metadata: MessageMetadata) => ({ 
                    content: formContent(content), 
                    metadata: withBinaryFieldsAsHex(omit(metadata, 'streamMessage'))
                })
                : (content: unknown) => formContent(content)
            const output = formMessage(msg.content, omit(msg, 'content'))
            console.info(isString(output) ? output : JSON.stringify(output))
        }
    }
}, {
    autoDestroyClient: false,
    clientOptionsFactory: (options) => ({
        orderMessages: !options.disableOrdering
    })
})
    .arguments('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition <partition>', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-r, --raw', 'subscribe raw', false)
    .option('-m, --with-metadata', 'print each message with its metadata included', false)
    .option('-b, --binary', 'binary output using length-prefixed frames', false)
    .parseAsync()
