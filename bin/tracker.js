#!/usr/bin/env node
const program = require('commander')
const StreamrClient = require('streamr-client')
const { startTracker } = require('streamr-network')
const Sentry = require('@sentry/node')
const pino = require('pino')
const ethers = require('ethers')

const CURRENT_VERSION = require('../package.json').version
const { getLogger } = require('../dist/src/helpers/logger')

const logger = getLogger('streamr:broker:tracker')

program
    .version(CURRENT_VERSION)
    .usage('<ethereumPrivateKey> <trackerName>')
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', 4)
    .option('--attachHttpEndpoints', 'attach http endpoints')
    .option('--sentryDns <sentryDns>', 'sentryDns', undefined)
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
            'ip', 'port', 'maxNeighborsPerNode', 'privateKeyFileName', 'certFileName',
            'sentryDns', 'attachHttpEndpoints']
        fields.forEach((prop) => {
            trackerObj[prop] = program.opts()[prop]
        })

        logger.info('started tracker: %o', {
            id,
            name,
            ...trackerObj
        })
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
