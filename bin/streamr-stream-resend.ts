#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { StreamrClientOptions } from 'streamr-client';
import { resend } from '../src/resend'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

function handlePublisherIdAndMsgChainId(commandOptions: any, resendOptions: any) {
    if ('publisherId' in commandOptions && !('msgChainId' in commandOptions)) {
        console.error('option --publisher-id must be accompanied by option --msg-chain-id')
        process.exit(1)
    }
    if ('msgChainId' in commandOptions && !('publisherId' in commandOptions)) {
        console.error('option --msg-chain-id must be accompanied by option --publisher-id')
        process.exit(1)
    }
    if ('publisherId' in commandOptions) {
        resendOptions.publisherId = commandOptions.publisherId
    }
    if ('msgChainId' in commandOptions) {
        resendOptions.msgChainId = commandOptions.msgChainId
    }
}

const program = new Command();

program
    .usage('<command> [<args>]')
    .description('request resend of stream and print JSON messages to stdout line-by-line')

program
    .command('last <n> <streamId>')
    .description('request last N messages')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .action((n: string, streamId: string, options: any, command: Command) => {
        // @ts-expect-error
        if (isNaN(n)) {
            console.error('argument n is not a number')
            process.exit(1)
        }
        const resendOptions = {
            last: parseInt(n)
        }
        const clientOptions: StreamrClientOptions & { subscribe?: boolean } = formStreamrOptionsWithEnv(command.parent!.opts())
        clientOptions.orderMessages = !options.disableOrdering
        clientOptions.subscribe = options.subscribe
        resend(streamId, resendOptions, clientOptions)
    })

program
    .command('from <from> <streamId>')
    .description('request messages starting from given date-time (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .action((from: string, streamId: string, options: any, command: Command) => {
        const resendOptions = {
            from: {
                timestamp: Date.parse(from),
                sequenceNumber: 0
            }
        }
        handlePublisherIdAndMsgChainId(options, resendOptions)
        const clientOptions: StreamrClientOptions & { subscribe?: boolean } = formStreamrOptionsWithEnv(command.parent!.opts())
        clientOptions.orderMessages = !options.disableOrdering
        clientOptions.subscribe = options.subscribe
        resend(streamId, resendOptions, clientOptions)
    })

program
    .command('range <from> <to> <streamId>')
    .description('request messages between two given date-times (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((from: string, to: string, streamId: string, options: any, command: Command) => {
        const resendOptions = {
            from: {
                timestamp: Date.parse(from),
                sequenceNumber: 0
            },
            to: {
                timestamp: Date.parse(to),
                sequenceNumber: 0
            },
        }
        handlePublisherIdAndMsgChainId(options, resendOptions)
        const clientOptions = formStreamrOptionsWithEnv(command.parent!.opts())
        clientOptions.orderMessages = !options.disableOrdering
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
