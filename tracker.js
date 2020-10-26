#!/usr/bin/env node
const program = require('commander')
const StreamrClient = require('streamr-client')
const { startTracker } = require('streamr-network')
const Sentry = require('@sentry/node')
const pino = require('pino')

const CURRENT_VERSION = require('./package.json').version
const logger = require('./src/helpers/logger')('streamr:broker:tracker')
const { authenticateFromConfig } = require('./src/helpers/ethereumAuthenticate')

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
const address = authenticateFromConfig({
    privateKey
})
const id = address || `tracker-${program.port}`
const name = trackerName || address

if (program.sentryDns) {
    logger.info('Configuring Sentry with dns: %s', program.sentryDns)
    Sentry.init({
        dsn: program.sentryDns,
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
            host: program.ip,
            port: Number.parseInt(program.port),
            id,
            name,
            maxNeighborsPerNode: Number.parseInt(program.maxNeighborsPerNode),
            attachHttpEndpoints: program.attachHttpEndpoints,
            privateKeyFileName: program.privateKeyFileName,
            certFileName: program.certFileName
        })

        const trackerObj = {}
        const fields = [
            'ip', 'port', 'maxNeighborsPerNode', 'privateKeyFileName', 'certFileName', 'metrics',
            'metricsInterval', 'apiKey', 'streamId', 'sentryDns', 'attachHttpEndpoints']
        fields.forEach((prop) => {
            trackerObj[prop] = program[prop]
        })

        logger.info('started tracker: %o', {
            id,
            name,
            ...trackerObj
        })

        if (program.metrics && program.apiKey && program.streamId) {
            const client = new StreamrClient({
                auth: {
                    apiKey: program.apiKey
                },
                autoConnect: false
            })
            setInterval(async () => {
                const metrics = await tracker.getMetrics()

                // send metrics to streamr.network
                if (client) {
                    client.publishHttp(program.streamId, metrics)
                }

                // output to console
                if (program.metrics) {
                    logger.info(JSON.stringify(metrics, null, 4))
                }
            }, program.metricsInterval)
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
