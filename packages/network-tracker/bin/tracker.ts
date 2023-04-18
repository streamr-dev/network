#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'
import { startTracker } from '../src/startTracker'
import { MetricsContext, Logger } from '@streamr/utils'
import { Wallet } from 'ethers'

const logger = new Logger(module)

const parseIntOption = (value: string) => parseInt(value, 10)

program
    .version(pkg.version)
    .usage('<ethereumPrivateKey>')
    .option('--port <port>', 'port', parseIntOption, 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--unixSocket <unixSocket>', 'unixSocket', undefined)
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', parseIntOption, 4)
    .option('--attachHttpEndpoints', 'attach http endpoints')
    .option('--privateKeyFileName <privateKeyFileName>', 'private key filename', undefined)
    .option('--certFileName <certFileName>', 'cert filename', undefined)
    .option('--topologyStabilizationDebounceWait <topologyStabilizationDebounceWait>', 'topologyStabilizationDebounceWait')
    .option('--topologyStabilizationMaxWait <topologyStabilizationMaxWait>', 'topologyStabilizationMaxWait')

    .description('Run Streamr Tracker')
    .parse(process.argv)

if (program.args.length < 1) {
    program.help()
}
const privateKey = program.args[0]
const wallet = new Wallet(privateKey)
const id = wallet.address
const listen = program.opts().unixSocket ? program.opts().unixSocket : {
    hostname: program.opts().ip,
    port: program.opts().port
}

const logError = (err: any, errorType: string) => {
    logger.fatal('Encountered error', { err, errorType })
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
            maxNeighborsPerNode: program.opts().maxNeighborsPerNode,
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

        logger.info('Started', {
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
