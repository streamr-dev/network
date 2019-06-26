#!/usr/bin/env node

const util = require('util')
const { startNetworkNode } = require('../src/composition')

const port = process.argv[2] || 30302
const host = process.argv[3] || '127.0.0.1'
const trackers = process.argv[4] ? process.argv[4].split(',') : ['ws://127.0.0.1:30300']
const streamId = process.argv[5] || 'default-stream-id'
const intervalInMs = process.argv[6] || 200

const id = `publisher-${port}`
const messageChainId = 'message-chain-id'

startNetworkNode(host, port, id)
    .then((publisher) => {
        trackers.map((trackerAddress) => publisher.addBootstrapTracker(trackerAddress))

        let lastTimestamp = null

        setInterval(() => {
            const timestamp = Date.now()
            const msg = 'Hello world, ' + new Date().toLocaleString()

            publisher.publish(streamId, 0, timestamp, 0, publisher.opts.id, messageChainId, lastTimestamp, 0, {
                msg
            })
            lastTimestamp = timestamp
        }, intervalInMs)

        setInterval(() => {
            console.log(util.inspect(publisher.getMetrics(), false, null))
        }, 5000)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
