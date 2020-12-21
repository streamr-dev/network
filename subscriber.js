const StreamrClient = require('streamr-client')
const privateKey = process.argv[2]
const streamId = process.argv[3]
const resendOptions = process.argv[4] === 'real-time' ? undefined : JSON.parse(process.argv[4])
const groupKey = process.argv[5] ? JSON.parse(process.argv[5]) : undefined

const options = {
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost/api/v1/ws",
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
client.connect().then(() => {
    const subOptions = {
        stream: streamId
    }
    if (resendOptions) {
        subOptions.resend = resendOptions
    }
    return client.getPublisherId().then((publisherId) => {
        return client.subscribe(subOptions, (content, streamMessage) => {
            // to be logged in test mode
            console.log(`whole message received: ${streamMessage.serialize()}`)
            // to be added by SubscriberJS to the message queue for verification in test mode
            console.log(`Received: ${streamMessage.getPublisherId()}###${streamMessage.getSerializedContent()}`)
        })
    })
})
