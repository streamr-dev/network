#!/usr/bin/env node
const program = require('commander')
const resend = require('../src/resend')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

function handlePublisherIdAndMsgChainId(cmd, resendOptions) {
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

program
    .usage('<command> [<args>]')
    .description('request resend of stream and print JSON messages to stdout line-by-line')

program
    .command('last <n> <streamId> [apiKey]')
    .description('request last N messages')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((n, streamId, apiKey, cmd) => {
        if (isNaN(n)) {
            console.error('argument n is not a number')
            process.exit(1)
        }
        const resendOptions = {
            last: parseInt(n)
        }
        const options = formStreamrOptionsWithEnv(cmd.parent)
        options.orderMessages = !cmd.disableOrdering
        resend(streamId, apiKey, resendOptions, options)
    })

program
    .command('from <from> <streamId> [apiKey]')
    .description('request messages starting from given date-time (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((from, streamId, apiKey, cmd) => {
        const resendOptions = {
            from: {
                timestamp: Date.parse(from),
                sequenceNumber: 0
            }
        }
        handlePublisherIdAndMsgChainId(cmd, resendOptions)
        const options = formStreamrOptionsWithEnv(cmd.parent)
        options.orderMessages = !cmd.disableOrdering
        resend(streamId, apiKey, resendOptions, options)
    })

program
    .command('range <from> <to> <streamId> [apiKey]')
    .description('request messages between two given date-times (format: "YYYY-MM-DDTHH:mm:ss.sssZ")')
    .option('--publisher-id <string>', 'filter results by publisher')
    .option('--msg-chain-id <string>', 'filter results by message chain')
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
    .action((from, to, streamId, apiKey, cmd) => {
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
        resend(streamId, apiKey, resendOptions, options)
    })

program
    .on('command:*', (invalidCommand) => {
        console.error(`invalid command: ${invalidCommand}`)
        process.exit(1)
    })

envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, Number.MAX_VALUE)
