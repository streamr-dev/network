#!/usr/bin/env node
const program = require('commander')
const { MessageLayer } = require('streamr-client-protocol')

const getLogger = require('../dist/helpers/logger').default
const { version: CURRENT_VERSION } = require('../package.json')
const { startNetworkNode } = require('../dist/composition')
const { StreamIdAndPartition } = require('../dist/identifiers')
const { MetricsContext } = require('../dist/helpers/MetricsContext')

const { StreamMessage, MessageID, MessageRef } = MessageLayer

const logger = getLogger('streamr:bin:publisher')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', undefined)
    .option('--nodeName <nodeName>', 'Human readble name for node', undefined)
    .option('--port <port>', 'port', '30302')
    .option('--ip <ip>', 'ip', '127.0.0.1')
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:27777'])
    .option('--streamId <streamId>', 'streamId to publish', 'stream-0')
    .option('--metrics <metrics>', 'log metrics', false)
    .option('--intervalInMs <intervalInMs>', 'interval to publish in ms', '2000')
    .option('--noise <noise>', 'bytes to add to messages', '64')
    .description('Run publisher')
    .parse(process.argv)

const publisherId = program.opts().id || `publisher-${program.opts().port}`
const name = program.opts().nodeName || publisherId
const noise = parseInt(program.opts().noise, 10)

const messageChainId = `message-chain-id-${program.opts().port}`
const streamObj = new StreamIdAndPartition(program.opts().streamId, 0)
const { id: streamId, partition } = streamObj

function generateString(length) {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
}

const metricsContext = new MetricsContext(publisherId)
startNetworkNode({
    host: program.opts().ip,
    port: program.opts().port,
    name: publisherId,
    id: publisherId,
    trackers: program.opts().trackers,
    metricsContext
})
    .then((publisher) => {
        logger.info('started publisher id: %s, name: %s, port: %d, ip: %s, trackers: %s, streamId: %s, intervalInMs: %d, metrics: %s',
            publisherId, name, program.opts().port, program.opts().ip, program.opts().trackers.join(', '), program.opts().streamId, program.opts().intervalInMs, program.opts().metrics)

        publisher.start()

        let lastTimestamp = null
        let sequenceNumber = 0

        setInterval(() => {
            const timestamp = Date.now()
            const msg = 'Hello world, ' + new Date().toLocaleString()

            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamId, partition, timestamp, sequenceNumber, publisherId, messageChainId),
                prevMsgRef: lastTimestamp == null ? null : new MessageRef(lastTimestamp, sequenceNumber - 1),
                content: {
                    msg,
                    noise: generateString(noise)
                },
            })
            publisher.publish(streamMessage)

            sequenceNumber += 1
            lastTimestamp = timestamp
        }, program.opts().intervalInMs)

        if (program.opts().metrics) {
            setInterval(async () => {
                logger.info(JSON.stringify(await metricsContext.report(true), null, 3))
            }, 5000)
        }
        return true
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
