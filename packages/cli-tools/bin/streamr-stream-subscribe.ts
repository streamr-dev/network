#!/usr/bin/env node
import '../src/logLevel'

import omit from 'lodash/omit'
import isString from 'lodash/isString'
import { StreamrClient, MessageMetadata } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { createFnParseInt } from '../src/common'
import { binaryToHex } from '@streamr/utils'

interface Options extends BaseOptions {
    partition: number
    disableOrdering: boolean
    raw: boolean
    withMetadata: boolean
}

createClientCommand(
    async (client: StreamrClient, streamId: string, options: Options) => {
        const formContent = (content: unknown) => (content instanceof Uint8Array ? binaryToHex(content) : content)
        const formMessage = options.withMetadata
            ? (content: unknown, metadata: MessageMetadata) => ({
                  content: formContent(content),
                  metadata: omit(metadata, 'streamMessage')
              })
            : (content: unknown) => formContent(content)
        await client.subscribe(
            {
                streamId,
                partition: options.partition,
                raw: options.raw
            },
            (content, metadata) => {
                const output = formMessage(content, metadata)
                console.info(isString(output) ? output : JSON.stringify(output))
            }
        )
    },
    {
        autoDestroyClient: false,
        clientOptionsFactory: (options) => ({
            orderMessages: !options.disableOrdering
        })
    }
)
    .arguments('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-r, --raw', 'subscribe raw', false)
    .option('-m, --with-metadata', 'print each message with its metadata included', false)
    .parseAsync()
