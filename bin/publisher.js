#!/usr/bin/env node

const util = require('util')

const program = require('commander')
const { MessageLayer } = require('streamr-client-protocol')

const CURRENT_VERSION = require('../package.json').version
const { startNetworkNode } = require('../src/composition')
const { StreamIdAndPartition } = require('../src/identifiers')

const { StreamMessage } = MessageLayer

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
const { id, partition } = streamObj

startNetworkNode(program.ip, program.port, publisherId)
    .then((publisher) => {
        console.log('started publisher id: %s, port: %d, ip: %s, trackers: %s, streamId: %s, intervalInMs: %d, metrics: %s',
            publisherId, program.port, program.ip, program.trackers.join(', '), program.streamId, program.intervalInMs, program.metrics)

        program.trackers.map((trackerAddress) => publisher.addBootstrapTracker(trackerAddress))

        let lastTimestamp = null
        let i = 0

        setInterval(() => {
            const timestamp = Date.now()
            const msg = 'Hello world, ' + new Date().toLocaleString()

            const streamMessage = StreamMessage.create(
                [id, partition, i, 0, publisherId, messageChainId],
                i === 0 ? null : [i - 1, 0],
                StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE,
                {
                    msg
                },
                StreamMessage.SIGNATURE_TYPES.NONE,
                null
            )
            publisher.publish(streamMessage)

            i += 1
            lastTimestamp = timestamp
        }, program.intervalInMs)

        if (program.metrics) {
            setInterval(async () => {
                console.log(util.inspect(await publisher.getMetrics(), false, null))
            }, 5000)
        }
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
