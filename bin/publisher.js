#!/usr/bin/env node

const program = require('commander')
const { MessageLayer } = require('streamr-client-protocol')

const CURRENT_VERSION = require('../package.json').version
const { startNetworkNode } = require('../src/composition')
const { StreamIdAndPartition } = require('../src/identifiers')

const { StreamMessage, MessageID, MessageRef } = MessageLayer

program
    .version(CURRENT_VERSION)
    .option('--port <port>', 'port', 30302)
    .option('--ip <ip>', 'ip', '127.0.0.1')
    .option('--trackers <trackers>', 'trackers', (value) => value.split(','), ['ws://127.0.0.1:30300'])
    .option('--streamId <streamId>', 'streamId to publish', 'default-stream-id')
    .option('--metrics <metrics>', 'log metrics', false)
    .option('--intervalInMs <intervalInMs>', 'interval to publish in ms', 200)
    .description('Run publisher')
    .parse(process.argv)

const publisherId = `publisher-${program.port}`
const messageChainId = `message-chain-id-${program.port}`
const streamObj = new StreamIdAndPartition(program.streamId, 0)
const { id: streamId, partition } = streamObj

startNetworkNode(program.ip, program.port, publisherId)
    .then((publisher) => {
        console.log('started publisher id: %s, port: %d, ip: %s, trackers: %s, streamId: %s, intervalInMs: %d, metrics: %s',
            publisherId, program.port, program.ip, program.trackers.join(', '), program.streamId, program.intervalInMs, program.metrics)

        program.trackers.map((trackerAddress) => publisher.addBootstrapTracker(trackerAddress))

        let lastTimestamp = null
        let sequenceNumber = 0

        setInterval(() => {
            const timestamp = Date.now()
            const msg = 'Hello world, ' + new Date().toLocaleString()

            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamId, partition, timestamp, sequenceNumber, publisherId, messageChainId),
                prevMsgRef: lastTimestamp == null ? null : new MessageRef(lastTimestamp, sequenceNumber - 1),
                content: {
                    msg
                },
            })
            publisher.publish(streamMessage)

            sequenceNumber += 1
            lastTimestamp = timestamp
        }, program.intervalInMs)

        if (program.metrics) {
            setInterval(async () => {
                console.info(JSON.stringify(await publisher.getMetrics(), null, 3))
            }, 5000)
        }
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
