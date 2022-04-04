#!/usr/bin/env node
const program = require('commander')

const { Logger } = require('../dist/src/helpers/Logger')
const { version: CURRENT_VERSION } = require('../package.json')
const { startTracker } = require('@streamr/network-tracker')
const { MetricsContext } = require('../dist/src/helpers/MetricsContext')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / tracker id', undefined)
    .option('--trackerName <trackerName>', 'Human readable name', undefined)
    .option('--port <port>', 'port', '27777')
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--unixSocket <unixSocket>', 'unixSocket', undefined)
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', '4')
    .option('--metrics <metrics>', 'output metrics to console', false)
    .option('--metricsInterval <metricsInterval>', 'metrics output interval (ms)', '5000')
    .option('--topologyStabilizationDebounceWait <topologyStabilizationDebounceWait>', 'topologyStabilizationDebounceWait')
    .option('--topologyStabilizationMaxWait <topologyStabilizationMaxWait>', 'topologyStabilizationMaxWait')
    .description('Run tracker with reporting')
    .parse(process.argv)

const id = program.opts().id || `TR${program.opts().port}`
const name = program.opts().trackerName || id
const logger = new Logger(module)
const listen = program.opts().unixSocket ? program.opts().unixSocket : {
    hostname: program.opts().ip,
    port: Number.parseInt(program.opts().port, 10)
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
    const metricsContext = new MetricsContext(id)
    try {
        await startTracker({
            listen,
            id,
            name,
            maxNeighborsPerNode: Number.parseInt(program.opts().maxNeighborsPerNode, 10),
            metricsContext,
            topologyStabilization: getTopologyStabilization()
        })

        const trackerObj = {}
        const fields = ['ip', 'port', 'maxNeighborsPerNode', 'metrics', 'metricsInterval']
        fields.forEach((prop) => {
            trackerObj[prop] = program.opts()[prop]
        })

        logger.info('started tracker: %o', {
            id,
            name,
            ...trackerObj
        })

        if (program.opts().metrics) {
            setInterval(async () => {
                const metrics = await metricsContext.report(true)
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
