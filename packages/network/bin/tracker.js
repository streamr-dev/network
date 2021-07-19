#!/usr/bin/env node
const program = require('commander')

const { Logger } = require('../dist/helpers/Logger')
const { version: CURRENT_VERSION } = require('../package.json')
const { startTracker } = require('../dist/composition')
const { MetricsContext } = require('../dist/helpers/MetricsContext')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / tracker id', undefined)
    .option('--trackerName <trackerName>', 'Human readable name', undefined)
    .option('--port <port>', 'port', '27777')
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', '4')
    .option('--metrics <metrics>', 'output metrics to console', false)
    .option('--metricsInterval <metricsInterval>', 'metrics output interval (ms)', '5000')
    .description('Run tracker with reporting')
    .parse(process.argv)

const id = program.opts().id || `TR${program.opts().port}`
const name = program.opts().trackerName || id
const logger = new Logger(module)
console.log(id)
async function main() {
    const metricsContext = new MetricsContext(id)
    try {
        await startTracker({
            host: program.opts().ip,
            port: Number.parseInt(program.opts().port, 10),
            id,
            name,
            maxNeighborsPerNode: Number.parseInt(program.opts().maxNeighborsPerNode, 10),
            metricsContext
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
