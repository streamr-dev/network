#!/usr/bin/env node

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const { startNetworkNode } = require('../src/composition')
const NodeToNode = require('../src/protocol/NodeToNode')

program
    .version(CURRENT_VERSION)
    .option('--port <port>', 'port', 30304)
    .option('--ip <ip>', 'ip', '127.0.0.1')
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:30300'])
    .option('--streamId <streamId>', 'streamId to publish', 'default-stream-id')
    .option('--metrics <metrics>', 'log metrics', false)
    .description('Run subscriber')
    .parse(process.argv)

const id = `subscriber-${program.port}`

startNetworkNode(program.ip, program.port, id).then((subscriber) => {
    console.log('started subscriber id: %s, port: %d, ip: %s, trackers: %s, streamId: %s, metrics: %s',
        id, program.port, program.ip, program.trackers.join(', '), program.streamId, program.metrics)

    subscriber.subscribe(program.streamId, 0)
    program.trackers.map((trackerAddress) => subscriber.addBootstrapTracker(trackerAddress))

    subscriber.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (brodcastMessage) => {
        const { streamMessage } = brodcastMessage
        console.log('received %j, data %j', streamMessage.messageId, streamMessage.getParsedContent())
    })

    if (program.metrics) {
        setInterval(async () => {
            console.info(JSON.stringify(await subscriber.getMetrics(), null, 3))
        }, 5000)
    }
}).catch((err) => {
    throw err
})

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}
