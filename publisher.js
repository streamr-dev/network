const StreamrClient = require('streamr-client')
const privateKey = process.argv[2]
const streamId = process.argv[3]
const interval = parseInt(process.argv[4])
const groupKey = process.argv[5]

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
setInterval(() => {
    const msg = {
        "client-implementation": "Javascript",
        "string-key": Math.random().toString(36).substr(2, 5),
        "integer-key": Math.floor(Math.random() * 100),
        "double-key": Math.random(),
        "array-key": [4, -5, 19]
    }

    client.publish(streamId, msg)
        .then(() => console.log('Published: ', JSON.stringify(msg)))
        .catch((err) => console.error(err))
}, interval)
