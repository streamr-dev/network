#!/usr/bin/env node

const util = require('util')

const { MessageLayer } = require('streamr-client-protocol')

const { startNetworkNode } = require('../src/composition')
const { StreamIdAndPartition } = require('../src/identifiers')

const { StreamMessage } = MessageLayer

const port = process.argv[2] || 30302
const host = process.argv[3] || '127.0.0.1'
const trackers = process.argv[4] ? process.argv[4].split(',') : ['ws://127.0.0.1:30300']
const streamId = process.argv[5] || 'default-stream-id'
const intervalInMs = process.argv[6] || 200

const publisherId = `publisher-${port}`
const messageChainId = `message-chain-id-${port}`
const streamObj = new StreamIdAndPartition(streamId, 0)
const { id, partition } = streamObj

startNetworkNode(host, port, publisherId)
    .then((publisher) => {
        trackers.map((trackerAddress) => publisher.addBootstrapTracker(trackerAddress))

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
        }, intervalInMs)

        setInterval(async () => {
            console.log(util.inspect(await publisher.getMetrics(), false, null))
        }, 5000)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
