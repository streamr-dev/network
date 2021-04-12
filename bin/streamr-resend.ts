#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { StreamrClientOptions } from 'streamr-client';
import { resend } from '../src/resend'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

function handlePublisherIdAndMsgChainId(cmd: any, resendOptions: any) {
    if ('publisherId' in cmd && !('msgChainId' in cmd)) {
        console.error('option --publisher-id must be accompanied by option --msg-chain-id')
        process.exit(1)
    }
    if ('msgChainId' in cmd && !('publisherId' in cmd)) {
        console.error('option --msg-chain-id must be accompanied by option --publisher-id')
        process.exit(1)
    }
    if ('publisherId' in cmd) {
        resendOptions.publisherId = cmd.publisherId
    }
    if ('msgChainId' in cmd) {
        resendOptions.msgChainId = cmd.msgChainId
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
    .action((n: string, streamId: string, cmd: Command) => {
        // @ts-expect-error
        if (isNaN(n)) {
            console.error('argument n is not a number')
            process.exit(1)
        }
        const resendOptions = {
            last: parseInt(n)
        }
        const options: StreamrClientOptions & { subscribe?: boolean } = formStreamrOptionsWithEnv(cmd.parent)
        options.orderMessages = !cmd.disableOrdering
        options.subscribe = cmd.subscribe
        resend(streamId, resendOptions, options)
    })

program
    .command('from <from> <streamId>')
    .description('request messages starting from given date-time (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .option('-s, --subscribe', 'subscribe in addition to resend', false)
    .action((from: string, streamId: string, cmd: Command) => {
        const resendOptions = {
            from: {
                timestamp: Date.parse(from),
                sequenceNumber: 0
            }
        }
        handlePublisherIdAndMsgChainId(cmd, resendOptions)
        const options: StreamrClientOptions & { subscribe?: boolean } = formStreamrOptionsWithEnv(cmd.parent)
        options.orderMessages = !cmd.disableOrdering
        options.subscribe = cmd.subscribe
        resend(streamId, resendOptions, options)
    })

program
    .command('range <from> <to> <streamId>')
    .description('request messages between two given date-times (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((from: string, to: string, streamId: string, cmd: Command) => {
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
        handlePublisherIdAndMsgChainId(cmd, resendOptions)
        const options = formStreamrOptionsWithEnv(cmd.parent)
        options.orderMessages = !cmd.disableOrdering
        resend(streamId, resendOptions, options)
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
