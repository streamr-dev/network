#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'
import { startTracker } from '../src/startTracker'
import { MetricsContext, Logger } from '@streamr/utils'
import { Wallet } from 'ethers'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore no declaration file for module
import { SlackBot } from '@streamr/slackbot'

const logger = new Logger(module)

program
    .version(pkg.version)
    .usage('<ethereumPrivateKey>')
    // @ts-expect-error TODO fix
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--unixSocket <unixSocket>', 'unixSocket', undefined)
    // @ts-expect-error TODO fix
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', 4)
    .option('--attachHttpEndpoints', 'attach http endpoints')
    .option('--privateKeyFileName <privateKeyFileName>', 'private key filename', undefined)
    .option('--certFileName <certFileName>', 'cert filename', undefined)
    .option('--topologyStabilizationDebounceWait <topologyStabilizationDebounceWait>', 'topologyStabilizationDebounceWait')
    .option('--topologyStabilizationMaxWait <topologyStabilizationMaxWait>', 'topologyStabilizationMaxWait')
    .option('--slackBotToken <slackBotToken>', 'slack API token', '')
    .option('--slackChannel <slackChannel>', 'slack channel for alerts', '#network-log')

    .description('Run tracker with reporting')
    .parse(process.argv)

if (program.args.length < 1) {
    program.help()
}
const privateKey = program.args[0]
const wallet = new Wallet(privateKey)
const id = wallet.address
const listen = program.opts().unixSocket ? program.opts().unixSocket : {
    hostname: program.opts().ip,
    port: Number.parseInt(program.opts().port, 10)
}

const { slackBotToken, slackChannel } = program.opts()
let slackbot: SlackBot
const slackAlertHeader = `Tracker ${id}`
if (slackBotToken && slackChannel) {
    slackbot = new SlackBot(slackChannel, slackBotToken)
}

const logError = (err: any, errorType: string) => {
    logger.getFinalLogger().error(err, errorType)
    if (slackbot !== undefined) {
        const message = `${errorType}: ${err}`
        slackbot.alert([message], slackAlertHeader)
    }
}

const getTopologyStabilization = () => {
    const debounceWait = program.opts().topologyStabilizationDebounceWait
    const maxWait = program.opts().topologyStabilizationMaxWait
    if ((debounceWait !== undefined) || (maxWait !== undefined)) {
        return {
            debounceWait: parseInt(debounceWait),
            maxWait: parseInt(maxWait)
        }
    } else {
        return undefined
    }
}

async function main() {
    try {
        await startTracker({
            listen,
            id,
            maxNeighborsPerNode: Number.parseInt(program.opts().maxNeighborsPerNode),
            attachHttpEndpoints: program.opts().attachHttpEndpoints,
            privateKeyFileName: program.opts().privateKeyFileName,
            certFileName: program.opts().certFileName,
            topologyStabilization: getTopologyStabilization(),
            metricsContext: new MetricsContext(),
            trackerPingInterval: 60 * 1000
        })

        const trackerObj: any = {}
        const fields = [
            'ip', 'port', 'maxNeighborsPerNode', 'privateKeyFileName', 'certFileName', 'attachHttpEndpoints', 'unixSocket']
        fields.forEach((prop) => {
            trackerObj[prop] = program.opts()[prop]
        })

        logger.info('started tracker: %o', {
            id,
            ...trackerObj
        })
    } catch (err) {
        logError(err, 'tracker bin catch')
        process.exit(1)
    }
}

main()

// pino.finalLogger
process.on('uncaughtException', (err) => {
    logError(err, 'uncaughtException')
    process.exit(1)
})

process.on('unhandledRejection', (err) => {
    logError(err, 'unhandledRejection')
    process.exit(1)
})
