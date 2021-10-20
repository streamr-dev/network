#!/usr/bin/env node
import { Command } from 'commander'
import { StreamrClientOptions } from 'streamr-client'
import { resend } from '../src/resend'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv, getStreamId } from './common'
import pkg from '../package.json'

function assertBothOrNoneDefined(option1: string, option2: string, errorMessage: string, commandOptions: any) {
    if ((option1 in commandOptions && !(option2 in commandOptions)) || (option2 in commandOptions && !(option1 in commandOptions))) {
        console.error(`option ${errorMessage}`)
        process.exit(1)
    }
}

const program = new Command()

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
        const clientOptions: StreamrClientOptions & { subscribe?: boolean } = formStreamrOptionsWithEnv(command.parent!.opts())
        clientOptions.orderMessages = !options.disableOrdering
        clientOptions.subscribe = options.subscribe
        const streamId = getStreamId(streamIdOrPath, command.parent!.opts())!
        resend(streamId, resendOptions, clientOptions)
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
        const clientOptions: StreamrClientOptions & { subscribe?: boolean } = formStreamrOptionsWithEnv(command.parent!.opts())
        clientOptions.orderMessages = !options.disableOrdering
        clientOptions.subscribe = options.subscribe
        const streamId = getStreamId(streamIdOrPath, command.parent!.opts())!
        resend(streamId, resendOptions, clientOptions)
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
        const clientOptions = formStreamrOptionsWithEnv(command.parent!.opts())
        clientOptions.orderMessages = !options.disableOrdering
        const streamId = getStreamId(streamIdOrPath, command.parent!.opts())!
        resend(streamId, resendOptions, clientOptions)
    })

program
    .on('command:*', (invalidCommand: any) => {
        console.error(`invalid command: ${invalidCommand}`)
        process.exit(1)
    })

authOptions(program)
envOptions(program)
    .version(pkg.version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, Number.MAX_VALUE)
