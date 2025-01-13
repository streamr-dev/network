#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { resend } from '../src/resend'

interface Options extends BaseOptions {
    disableOrdering: boolean
    subscribe: boolean
}

createClientCommand(
    async (client: StreamrClient, n: string, streamId: string, options: Options) => {
        if (isNaN(n as any)) {
            console.error('argument n is not a number')
            process.exit(1)
        }
        const resendOptions = {
            last: parseInt(n)
        }
        await resend(streamId, resendOptions, client, options.subscribe)
    },
    {
        clientOptionsFactory: (options) => ({
            orderMessages: !options.disableOrdering
        })
    }
)
    .arguments('<n> <streamId>')
    .description('request last N messages')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .parseAsync()
