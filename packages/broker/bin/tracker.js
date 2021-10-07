#!/usr/bin/env node
const program = require('commander')
const { startTracker, Logger } = require('streamr-network')
const ethers = require('ethers')
const { SlackBot } = require('@streamr/slackbot')

const CURRENT_VERSION = require('../package.json').version

const logger = new Logger(module)

program
    .version(CURRENT_VERSION)
    .usage('<ethereumPrivateKey> <trackerName>')
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--unixSocket <unixSocket>', 'unixSocket', undefined)
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

if (program.args.length < 2) {
    program.help()
}
const privateKey = program.args[0]
const trackerName = program.args[1]
const wallet = new ethers.Wallet(privateKey)
const address = wallet ? wallet.address : null
const id = address || `tracker-${program.opts().port}`
const name = trackerName || address
const listen = program.opts().unixSocket ? program.opts().unixSocket : {
    hostname: program.opts().ip,
    port: Number.parseInt(program.opts().port, 10)
}

const { slackBotToken, slackChannel } = program.opts()
let slackbot
const slackAlertName = `Tracker ${trackerName} ${id}`
if (slackBotToken && slackChannel) {
    slackbot = new SlackBot(slackChannel, slackBotToken)
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
            name,
            maxNeighborsPerNode: Number.parseInt(program.opts().maxNeighborsPerNode),
            attachHttpEndpoints: program.opts().attachHttpEndpoints,
            privateKeyFileName: program.opts().privateKeyFileName,
            certFileName: program.opts().certFileName,
            topologyStabilization: getTopologyStabilization()
        })

        const trackerObj = {}
        const fields = [
            'ip', 'port', 'maxNeighborsPerNode', 'privateKeyFileName', 'certFileName', 'attachHttpEndpoints', 'unixSocket']
        fields.forEach((prop) => {
            trackerObj[prop] = program.opts()[prop]
        })

        logger.info('started tracker: %o', {
            id,
            name,
            ...trackerObj
        })
    } catch (err) {
        logger.getFinalLogger().error(err, 'tracker bin catch')
        if (slackbot) {
            slackbot.alert(['Uncaught exception: ' + err], slackAlertName)
        }
        process.exit(1)
    }
}

main()

// pino.finalLogger
process.on('uncaughtException', (err) => {
    logger.getFinalLogger().error(err, 'uncaughtException')
    if (slackbot) {
        slackbot.alert(['Uncaught exception: ' + err], slackAlertName)
    }
    process.exit(1)
})

process.on('unhandledRejection', (err) => {
    logger.getFinalLogger().error(err, 'unhandledRejection')
    if (slackbot) {
        slackbot.alert(['Uncaught rejection: ' + err], slackAlertName)
    }
    process.exit(1)
})
