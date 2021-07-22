#!/usr/bin/env node
const program = require('commander')
const { MessageLayer } = require('streamr-client-protocol')

const { Logger } = require('../dist/helpers/Logger')
const { version: CURRENT_VERSION } = require('../package.json')
const { createNetworkNode } = require('../dist/composition')
const { MetricsContext } = require('../dist/helpers/MetricsContext')

const { StreamMessage, MessageID, MessageRef } = MessageLayer

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', undefined)
    .option('--nodeName <nodeName>', 'Human readble name for node', undefined)
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:27777'])
    .option('--trackerIds <trackersIds>', 'tracker Ids', (value) => value.split(','), ['tracker'])
    .option('--streamIds <streamIds>', 'streamId to publish',  (value) => value.split(','), ['stream-0'])
    .option('--metrics <metrics>', 'log metrics', false)
    .option('--intervalInMs <intervalInMs>', 'interval to publish in ms', '2000')
    .option('--noise <noise>', 'bytes to add to messages', '64')
    .description('Run publisher')
    .parse(process.argv)

const id = program.opts().id || 'PU'
const name = program.opts().nodeName || id
const logger = new Logger(module)

const trackerInfos = program.opts().trackers.map((ws, i) => {
    return {
        id: program.opts().trackerIds[i],
        ws
    }
})

const noise = parseInt(program.opts().noise, 10)

const messageChainId = 'message-chain-id'

function generateString(length) {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
}

const metricsContext = new MetricsContext(id)
const publisher = createNetworkNode({
    name,
    id,
    trackers: trackerInfos,
    metricsContext
})
logger.info('started publisher id: %s, name: %s, ip: %s, trackers: %s, streamId: %s, intervalInMs: %d, metrics: %s',
    id, name, program.opts().ip, program.opts().trackers.join(', '),
    program.opts().streamIds, program.opts().intervalInMs, program.opts().metrics)

publisher.start()

let lastTimestamp = null
let sequenceNumber = 0

setInterval(() => {
    const timestamp = Date.now()
    const msg = 'Hello world, ' + new Date().toLocaleString()
    program.opts().streamIds.forEach((streamId) => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, timestamp, sequenceNumber, id, messageChainId),
            prevMsgRef: lastTimestamp == null ? null : new MessageRef(lastTimestamp, sequenceNumber - 1),
            content: {
                msg,
                noise: generateString(noise),
                sequenceNumber
            },
        })
        publisher.publish(streamMessage)
    })
    sequenceNumber += 1
    lastTimestamp = timestamp
}, program.opts().intervalInMs)

if (program.opts().metrics) {
    setInterval(async () => {
        logger.info(JSON.stringify(await metricsContext.report(true), null, 3))
    }, 5000)
}
