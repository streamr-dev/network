const crypto = require('crypto')
const { ethers } = require('ethers')
const StreamrClient = require('streamr-client')
const privateKey = process.argv[2]
const streamId = process.argv[3]
const publishFunctionName = process.argv[4]
const interval = parseInt(process.argv[5])
const maxMessages = parseInt(process.argv[6])
const groupKey = process.argv[7] ? JSON.parse(process.argv[7]) : undefined

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const options = {
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost/api/v1/ws",
    auth: {
        privateKey: privateKey,
    },
    publisherGroupKeys: {}
}

if (groupKey) {
    // TODO: update when client implementation is up to date and we know how to pass the GroupKeys there
    options.publisherGroupKeys[streamId] = Buffer.from(groupKey.groupKeyHex, 'hex')
}

const client = new StreamrClient(options)
client.on('error', console.error)

let counter = 0

const rotatingPublishFunction = async (msgToPublish) => {
    if (counter % 10 === 0) {
        await client.setNextGroupKey()
    }
    await defaultPublishFunction(msgToPublish)
}

const defaultPublishFunction = async (msgToPublish) => {
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

const publishMessage = async () => {
    counter++
    const msg = {
        "counter": counter,
        "client-implementation": "Javascript",
        "string-key": Math.random().toString(36).substr(2, 5),
        "integer-key": Math.floor(Math.random() * 100),
        "double-key": Math.random(),
        "array-key": [4, -5, 19]
    }
    console.log('Going to publish: ', JSON.stringify(msg))
    await publishFunction(msg)

    if (maxMessages && counter >= maxMessages) {
        console.log(`Done: All ${maxMessages} messages published. Quitting JS publisher.`)
        // Disconnect gracefully so that this process will quit.
        // Don't do it immediately to avoid messing up the last published message in any way.
        await wait(2000)
        await client.disconnect()
    } else {
        setTimeout(publishMessage, interval)
    }
}

publishMessage()
