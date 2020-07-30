const StreamrClient = require('streamr-client')
const privateKey = process.argv[2]
const streamId = process.argv[3]
const resendOptions = process.argv[4] === 'real-time' ? undefined : JSON.parse(process.argv[4])
const groupKey = process.argv[5] ? JSON.parse(process.argv[5]) : undefined

const clientOptions = {
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost/api/v1/ws",
    auth: {
        privateKey: privateKey,
    },
}
if (groupKey) {
    // TODO: update when client implementation is up to date and we know how to pass the GroupKeys there
    // groupKey has the following fields:
    // groupKey.groupKeyId
    // groupKey.groupKeyHex
}
const client = new StreamrClient(clientOptions)
client.connect()
const options = {
    stream: streamId
}
if (resendOptions) {
    options.resend = resendOptions
}
client.getPublisherId().then((publisherId) => {
    client.subscribe(options, (content, streamMessage) => {
        // to be logged in test mode
        console.log(`whole message received: ${streamMessage.serialize()}`)
        // to be added by SubscriberJS to the message queue for verification in test mode
        console.log(`Received: ${streamMessage.getPublisherId()}###${streamMessage.getSerializedContent()}`)
    })
})

