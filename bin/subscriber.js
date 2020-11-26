#!/usr/bin/env node

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const { startNetworkNode } = require('../src/composition')
const Node = require('../src/logic/Node')
const logger = require('../src/helpers/logger')('streamr:bin:publisher')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', undefined)
    .option('--nodeName <nodeName>', 'Human readble name for node', undefined)
    .option('--port <port>', 'port', 30304)
    .option('--ip <ip>', 'ip', '127.0.0.1')
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:27777'])
    .option('--streamId <streamId>', 'streamId to publish', 'stream-0')
    .option('--metrics <metrics>', 'log metrics', false)
    .description('Run subscriber')
    .parse(process.argv)

const id = program.id || `subscriber-${program.port}`
const name = program.nodeName || id

startNetworkNode({
    host: program.ip, port: program.port, name: id, id, trackers: program.trackers, storage: []
}).then((subscriber) => {
    logger.info('started subscriber id: %s, name: %s, port: %d, ip: %s, trackers: %s, streamId: %s, metrics: %s',
        id, name, program.port, program.ip, program.trackers.join(', '), program.streamId, program.metrics)
    subscriber.start()
    subscriber.subscribe(program.streamId, 0)

    let messageNo = 0
    let lastReported = 0
    subscriber.on(Node.events.UNSEEN_MESSAGE_RECEIVED, (streamMessage) => {
        messageNo += 1
        logger.info('received %j, data %j', streamMessage.getMsgChainId(), streamMessage.getParsedContent())
    })

    setInterval(() => {
        const newMessages = messageNo - lastReported
        console.info('%s received %d (%d)', id, messageNo, newMessages)
        lastReported = messageNo
    }, 60 * 1000)

    if (program.metrics) {
        setInterval(async () => {
            logger.info(JSON.stringify(await subscriber.getMetrics(), null, 3))
        }, 5000)
    }
    return true
}).catch((err) => {
    throw err
})

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}
