#!/usr/bin/env node
import { StreamrClient } from 'streamr-client'
import { createClientCommand } from '../src/command'
import { assertBothOrNoneDefined, resend } from '../src/resend'
import { getStreamId } from './common'

createClientCommand(async (client: StreamrClient, from: string, to: string, streamIdOrPath: string, options: any) => {
    const resendOptions = {
        from: {
            timestamp: Date.parse(from),
            sequenceNumber: 0
        },
        to: {
            timestamp: Date.parse(to),
            sequenceNumber: 0
        },
        publisherId: options.publisherId,
        msgChainId: options.msgChainId
    }
    assertBothOrNoneDefined('publisherId', 'msgChainId', '--publisher-id must be accompanied by option --msg-chain-id', options)
    const streamId = getStreamId(streamIdOrPath, options)!
    await resend(streamId, resendOptions, client, false) 
}, (options) => ({
    orderMessages: !options.disableOrdering
}))
    .arguments('<from> <to> <streamId>')
    .description('request messages between two given date-times (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .parseAsync()
