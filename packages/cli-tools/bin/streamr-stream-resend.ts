#!/usr/bin/env node
import { Command } from 'commander'
import { StreamrClient, ResendOptions } from 'streamr-client'
import { getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

function assertBothOrNoneDefined(option1: string, option2: string, errorMessage: string, commandOptions: any) {
    if ((option1 in commandOptions && !(option2 in commandOptions)) || (option2 in commandOptions && !(option1 in commandOptions))) {
        console.error(`option ${errorMessage}`)
        process.exit(1)
    }
}

const resend = async (
    streamId: string,
    resendOpts: ResendOptions,
    client: StreamrClient,
    subscribe: boolean
): Promise<void> => {
    try {
        const subscribeOpts = {
            stream: streamId,
            resend: resendOpts
        }
        const handler = (message: any) => {
            console.info(JSON.stringify(message))
        }
        if (subscribe) {
            await client.subscribe(subscribeOpts, handler)
        } else {
            await client.resend(subscribeOpts, handler)
        }
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }
}

const program = createCommand()

program
    .usage('<command> [<args>]')
    .description('request resend of stream and print JSON messages to stdout line-by-line')

program
    .command('last <n> <streamId>')
    .description('request last N messages')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .action((n: string, streamIdOrPath: string, options: any, command: Command) => {
        if (isNaN(n as any)) {
            console.error('argument n is not a number')
            process.exit(1)
        }
        const resendOptions = {
            last: parseInt(n)
        }
        const streamId = getStreamId(streamIdOrPath, command.parent!.opts())!
        const client = createClient(command.parent!.opts(), {
            orderMessages: !options.disableOrdering
        })
        resend(streamId, resendOptions, client, options.subscribe)
    })

program
    .command('from <from> <streamId>')
    .description('request messages starting from given date-time (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .action((from: string, streamIdOrPath: string, options: any, command: Command) => {
        const resendOptions = {
            from: {
                timestamp: Date.parse(from),
                sequenceNumber: 0
            },
            publisherId: options.publisherId
        }
        const streamId = getStreamId(streamIdOrPath, command.parent!.opts())!
        const client = createClient(command.parent!.opts(), {
            orderMessages: !options.disableOrdering
        })
        resend(streamId, resendOptions, client, options.subscribe)
    })

program
    .command('range <from> <to> <streamId>')
    .description('request messages between two given date-times (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((from: string, to: string, streamIdOrPath: string, options: any, command: Command) => {
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
        const streamId = getStreamId(streamIdOrPath, command.parent!.opts())!
        const client = createClient(command.parent!.opts(), {
            orderMessages: !options.disableOrdering
        })
        resend(streamId, resendOptions, client, false) 
    })

program
    .parse()
