#!/usr/bin/env node
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'
import { resend } from '../src/resend'
import { getStreamId } from './common'

createClientCommand(async (client: StreamrClient, from: string, streamIdOrPath: string, options: any) => {
    const resendOptions = {
        from: {
            timestamp: Date.parse(from),
            sequenceNumber: 0
        },
        publisherId: options.publisherId
    }
    const streamId = getStreamId(streamIdOrPath, options)!
    await resend(streamId, resendOptions, client, options.subscribe)
}, (options) => ({
    orderMessages: !options.disableOrdering
}))
    .arguments('<from> <streamId>')
    .description('request messages starting from given date-time (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .parseAsync()
