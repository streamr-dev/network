#!/usr/bin/env node
const program = require('commander')

const { Logger } = require('../dist/helpers/Logger')
const { version: CURRENT_VERSION } = require('../package.json')
const { createNetworkNode } = require('../dist/composition')
const { MetricsContext } = require('../dist/helpers/MetricsContext')
const { Event: NodeEvent } = require('../dist/logic/Node')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', undefined)
    .option('--nodeName <nodeName>', 'Human readble name for node', undefined)
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:27777'])
    .option('--streamIds <streamIds>', 'streamId to publish', (value) => value.split(','), ['stream-0'])
    .option('--metrics <metrics>', 'log metrics', false)
    .description('Run subscriber')
    .parse(process.argv)

const id = program.opts().id || 'SU'
const name = program.opts().nodeName || id
const logger = new Logger(module)
const metricsContext = new MetricsContext(id)
const subscriber = createNetworkNode({
    name,
    id,
    trackers: program.opts().trackers,
    metricsContext
})
logger.info('started subscriber id: %s, name: %s, ip: %s, trackers: %s, streamId: %s, metrics: %s',
    id, name, program.opts().ip, program.opts().trackers.join(', '), program.opts().streamId, program.opts().metrics)
subscriber.start()
program.opts().streamIds.forEach((stream) => subscriber.subscribe(stream, 0))

let messageNo = 0
let lastReported = 0
subscriber.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, (streamMessage) => {
    messageNo += 1
    logger.info('received %j, data %j', streamMessage.getMsgChainId(), streamMessage.getParsedContent())
})

setInterval(() => {
    const newMessages = messageNo - lastReported
    logger.info('%s received %d (%d)', id, messageNo, newMessages)
    lastReported = messageNo
}, 60 * 1000)

if (program.opts().metrics) {
    setInterval(async () => {
        logger.info(JSON.stringify(await metricsContext.report(true), null, 3))
    }, 5000)
}
