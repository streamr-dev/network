const crypto = require('crypto')
const { ethers } = require('ethers')
const StreamrClient = require('streamr-client')
const privateKey = process.argv[2]
const streamId = process.argv[3]
const publishFunctionName = process.argv[4]
const interval = parseInt(process.argv[5])
const groupKey = process.argv[6]

const options = {
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost/api/v1/ws",
    auth: {
        privateKey: privateKey,
    },
    publisherGroupKeys: {}
}
if (groupKey) {
    options.publisherGroupKeys[streamId] = Buffer.from(groupKey, 'hex')
}
const client = new StreamrClient(options)

let counter = 0
const rotatingPublishFunction = (msgToPublish) => {
    counter += 1
    if (counter % 10 === 0) {
        const groupKey = crypto.randomBytes(32)

        console.log("Rotating the key. New key: " + ethers.utils.hexlify(groupKey))
        client.publish(streamId, msgToPublish, Date.now(), null, groupKey)
            .then(() => console.log('Published: ', JSON.stringify(msgToPublish)))
            .catch((err) => console.error(err))
        counter = 0
    } else {
        client.publish(streamId, msgToPublish)
            .then(() => console.log('Published: ', JSON.stringify(msgToPublish)))
            .catch((err) => console.error(err))
    }
}

const defaultPublishFunction = (msgToPublish) => {
    client.publish(streamId, msgToPublish)
        .then(() => console.log('Published: ', JSON.stringify(msgToPublish)))
        .catch((err) => console.error(err))
}

let publishFunction = () => { throw new Error('Undefined publish function') }
if (publishFunctionName === 'default') {
    publishFunction = defaultPublishFunction
} else if (publishFunctionName === 'rotating') {
    publishFunction = rotatingPublishFunction
}

setInterval(() => {
    const msg = {
        "client-implementation": "Javascript",
        "string-key": Math.random().toString(36).substr(2, 5),
        "integer-key": Math.floor(Math.random() * 100),
        "double-key": Math.random(),
        "array-key": [4, -5, 19]
    }
    console.log('Going to publish: ', JSON.stringify(msg))
    publishFunction(msg)
}, interval)
