#!/usr/bin/env node
import '../src/logLevel'
import omit from 'lodash/omit'
import isString from 'lodash/isString'
import StreamrClient, { MessageMetadata } from 'streamr-client'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { createFnParseInt } from '../src/common'

interface Options extends BaseOptions {
    partition: number
    disableOrdering: boolean
    raw: boolean
    withMetadata: boolean
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    const formMessage = options.withMetadata
        ? (message: unknown, metadata: MessageMetadata) => ({ message, metadata: omit(metadata, 'streamMessage') })
        : (message: unknown) => message
    await client.subscribe({
        streamId,
        partition: options.partition,
        raw: options.raw
    }, (message, metadata) => {
        const output = formMessage(message, metadata)
        console.info(isString(output) ? output : JSON.stringify(output))
    })
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
    .option('-r, --raw', 'subscribe raw', false)
    .option('-m, --with-metadata', 'print each message with its metadata included', false)
    .parseAsync()
