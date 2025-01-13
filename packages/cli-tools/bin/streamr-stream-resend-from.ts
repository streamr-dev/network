#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { resend } from '../src/resend'

interface Options extends BaseOptions {
    publisherId?: string
    disableOrdering: boolean
    subscribe: boolean
}

createClientCommand(
    async (client: StreamrClient, from: string, streamId: string, options: Options) => {
        const resendOptions = {
            from: {
                timestamp: Date.parse(from),
                sequenceNumber: 0
            },
            publisherId: options.publisherId
        }
        await resend(streamId, resendOptions, client, options.subscribe)
    },
    {
        clientOptionsFactory: (options) => ({
            orderMessages: !options.disableOrdering
        })
    }
)
    .arguments('<from> <streamId>')
    .description('request messages starting from given date-time (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .parseAsync()
