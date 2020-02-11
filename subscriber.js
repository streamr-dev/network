const StreamrClient = require('streamr-client')
const privateKey = process.argv[2]
const streamId = process.argv[3]
const client = new StreamrClient({
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost/api/v1/ws",
    auth: {
        privateKey: privateKey,
    },
})
client.connect()
client.getPublisherId().then((publisherId) => {
    client.subscribe({
        stream: streamId
    }, (content, streamMessage) => {
        // to be printed in test mode
        console.log(`Subscriber ${publisherId} received: ${streamMessage.serialize()}`)
        // to be added by SubscriberJS to the message queue for verification in test mode
        console.log(`Received: ${streamMessage.getPublisherId()}###${streamMessage.getSerializedContent()}`)
    })
})

