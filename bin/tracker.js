#!/usr/bin/env node
const program = require('commander')
const StreamrClient = require('streamr-client')
const { startTracker } = require('streamr-network')
const Sentry = require('@sentry/node')
const pino = require('pino')
const ethers = require('ethers')

const CURRENT_VERSION = require('../package.json').version
const logger = require('../dist/src/helpers/logger')('streamr:broker:tracker')

program
    .version(CURRENT_VERSION)
    .usage('<ethereumPrivateKey> <trackerName>')
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', 4)
    .option('--attachHttpEndpoints', 'attach http endpoints')
    .option('--apiKey <apiKey>', 'apiKey for StreamrClient', undefined)
    .option('--streamId <streamId>', 'streamId for StreamrClient', undefined)
    .option('--sentryDns <sentryDns>', 'sentryDns', undefined)
    .option('--metrics <metrics>', 'output metrics to console', false)
    .option('--metricsInterval <metricsInterval>', 'metrics output interval (ms)', 5000)
    .option('--privateKeyFileName <privateKeyFileName>', 'private key filename', undefined)
    .option('--certFileName <certFileName>', 'cert filename', undefined)
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

if (program.opts().sentryDns) {
    logger.info('Configuring Sentry with dns: %s', program.opts().sentryDns)
    Sentry.init({
        dsn: program.opts().sentryDns,
        integrations: [
            new Sentry.Integrations.Console({
                levels: ['error']
            })
        ],
        environment: id
    })

    Sentry.configureScope((scope) => {
        scope.setUser({
            id
        })
    })
}

async function main() {
    try {
        const tracker = await startTracker({
            host: program.opts().ip,
            port: Number.parseInt(program.opts().port),
            id,
            name,
            maxNeighborsPerNode: Number.parseInt(program.opts().maxNeighborsPerNode),
            attachHttpEndpoints: program.opts().attachHttpEndpoints,
            privateKeyFileName: program.opts().privateKeyFileName,
            certFileName: program.opts().certFileName
        })

        const trackerObj = {}
        const fields = [
            'ip', 'port', 'maxNeighborsPerNode', 'privateKeyFileName', 'certFileName', 'metrics',
            'metricsInterval', 'apiKey', 'streamId', 'sentryDns', 'attachHttpEndpoints']
        fields.forEach((prop) => {
            trackerObj[prop] = program.opts()[prop]
        })

        logger.info('started tracker: %o', {
            id,
            name,
            ...trackerObj
        })

        if (program.opts().metrics && program.opts().apiKey && program.opts().streamId) {
            const client = new StreamrClient({
                auth: {
                    apiKey: program.opts().apiKey
                },
                autoConnect: false
            })
            setInterval(async () => {
                const metrics = await tracker.getMetrics()

                // send metrics to streamr.network
                if (client) {
                    client.publishHttp(program.opts().streamId, metrics)
                }

                // output to console
                if (program.opts().metrics) {
                    logger.info(JSON.stringify(metrics, null, 4))
                }
            }, program.opts().metricsInterval)
        }
    } catch (err) {
        pino.final(logger).error(err, 'tracker bin catch')
        process.exit(1)
    }
}

main()

// pino.finalLogger
process.on('uncaughtException', pino.final(logger, (err, finalLogger) => {
    finalLogger.error(err, 'uncaughtException')
    process.exit(1)
}))

process.on('unhandledRejection', pino.final(logger, (err, finalLogger) => {
    finalLogger.error(err, 'unhandledRejection')
    process.exit(1)
}))
