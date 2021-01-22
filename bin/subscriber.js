#!/usr/bin/env node
const program = require('commander')
const { MessageLayer } = require('streamr-client-protocol')

const getLogger = require('../dist/helpers/logger').default
const { version: CURRENT_VERSION } = require('../package.json')
const { startNetworkNode } = require('../dist/composition')
const { MetricsContext } = require('../dist/helpers/MetricsContext')
const { Event: NodeEvent } = require('../dist/logic/Node')

const logger = getLogger('streamr:bin:subscriber')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', undefined)
    .option('--nodeName <nodeName>', 'Human readble name for node', undefined)
    .option('--port <port>', 'port', '30304')
    .option('--ip <ip>', 'ip', '127.0.0.1')
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:27777'])
    .option('--streamId <streamId>', 'streamId to publish', 'stream-0')
    .option('--metrics <metrics>', 'log metrics', false)
    .description('Run subscriber')
    .parse(process.argv)

const id = program.opts().id || `subscriber-${program.opts().port}`
const name = program.opts().nodeName || id

const metricsContext = new MetricsContext(id)
startNetworkNode({
    host: program.opts().ip,
    port: program.opts().port,
    name: id,
    id,
    trackers: program.opts().trackers,
    metricsContext
}).then((subscriber) => {
    logger.info('started subscriber id: %s, name: %s, port: %d, ip: %s, trackers: %s, streamId: %s, metrics: %s',
        id, name, program.opts().port, program.opts().ip, program.opts().trackers.join(', '), program.opts().streamId, program.opts().metrics)
    subscriber.start()
    subscriber.subscribe(program.opts().streamId, 0)

    let messageNo = 0
    let lastReported = 0
    subscriber.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, (streamMessage) => {
        messageNo += 1
        logger.info('received %j, data %j', streamMessage.getMsgChainId(), streamMessage.getParsedContent())
    })

    setInterval(() => {
        const newMessages = messageNo - lastReported
        console.info('%s received %d (%d)', id, messageNo, newMessages)
        lastReported = messageNo
    }, 60 * 1000)

    if (program.opts().metrics) {
        setInterval(async () => {
            logger.info(JSON.stringify(await metricsContext.report(true), null, 3))
        }, 5000)
    }
    return true
}).catch((err) => {
    throw err
})

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}
