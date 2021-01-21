const crypto = require('crypto')
const { ethers } = require('ethers')
const StreamrClient = require('streamr-client')
const opts = JSON.parse(process.argv[2])

const {
    privateKey,
    streamId,
    publishFunctionName,
} = opts

const interval = parseInt(opts.interval)
const maxMessages = parseInt(opts.maxMessages)
const groupKey = opts.groupKey ? JSON.parse(opts.groupKey) : null

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const options = {
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost:8890/api/v1/ws",
    auth: {
        privateKey: privateKey,
    },
}

if (groupKey) {
    options.groupKeys = {
        [streamId]: {
            [groupKey.groupKeyId]: {
                ...groupKey
            }
        }
    }
}

const client = new StreamrClient(options)
client.on('error', console.error)

const rotatingPublishFunction = async (msgToPublish, counter) => {
    if (counter % 10 === 0) {
        await client.rotateGroupKey(streamId)
    }
    await defaultPublishFunction(msgToPublish, counter)
}

const defaultPublishFunction = async (msgToPublish, counter) => {
    try {
        await client.publish(streamId, msgToPublish)
        console.log('Published: ', JSON.stringify(msgToPublish))
    } catch (err) {
        console.error(err)
    }
}

let publishFunction = () => { throw new Error('Undefined publish function') }
if (publishFunctionName === 'default') {
    publishFunction = defaultPublishFunction
} else if (publishFunctionName === 'rotating') {
    publishFunction = rotatingPublishFunction
}

let Counter = 0
const publishMessage = async () => {
    const counter = Counter++
    const msg = {
        "counter": counter,
        "client-implementation": "Javascript",
        "publisher": client.getAddress(),
        "string-key": Math.random().toString(36).substr(2, 5),
        "integer-key": Math.floor(Math.random() * 100),
        "double-key": Math.random(),
        "array-key": [4, -5, 19]
    }
    console.log('Going to publish: ', JSON.stringify(msg))
    await publishFunction(msg, counter)

    if (maxMessages && counter >= maxMessages - 1) {
        console.log(`Done: All ${maxMessages} messages published. Quitting JS publisher.`)
        // Disconnect gracefully so that this process will quit.
        // Don't do it immediately to avoid messing up the last published message in any way.
        await wait(15000)
        await client.disconnect()
    } else {
        setTimeout(publishMessage, interval)
    }
}

publishMessage()
