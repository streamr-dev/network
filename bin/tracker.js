#!/usr/bin/env node

const util = require('util')

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const { startTracker } = require('../src/composition')

program
    .version(CURRENT_VERSION)
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '127.0.0.1')
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', 4)
    .option('--metrics <metrics>', 'log metrics', false)
    .description('Run tracker without reporting')
    .parse(process.argv)

const id = `tracker-${program.port}`

startTracker(program.ip, program.port, id, program.maxNeighborsPerNode)
    .then((tracker) => {
        console.log('started tracker id: %s, port: %d, ip: %s, maxNeighborsPerNode: %d, metrics: %s',
            id, program.port, program.ip, program.maxNeighborsPerNode, program.metrics)
        if (program.metrics) {
            setInterval(async () => {
                const metrics = await tracker.getMetrics()
                console.log(util.inspect(metrics, false, null))
            }, 5000)
        }
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}

