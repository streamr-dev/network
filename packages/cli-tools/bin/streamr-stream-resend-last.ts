#!/usr/bin/env node
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'
import { resend } from '../src/resend'
import { getStreamId } from './common'

createClientCommand(async (client: StreamrClient, n: string, streamIdOrPath: string, options: any) => {
    if (isNaN(n as any)) {
        console.error('argument n is not a number')
        process.exit(1)
    }
    const resendOptions = {
        last: parseInt(n)
    }
    const streamId = getStreamId(streamIdOrPath, options)!
    await resend(streamId, resendOptions, client, options.subscribe)
}, (options) => ({
    orderMessages: !options.disableOrdering
}))
    .arguments('<n> <streamId>')
    .description('request last N messages')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .parseAsync()