const StreamrClient = require('streamr-client')
const opts = JSON.parse(process.argv[2])

const {
    privateKey,
    streamId,
} = opts

const groupKey = opts.groupKey ? JSON.parse(opts.groupKey) : undefined
const resendOptions = opts.resendOptions === 'real-time' ? undefined : JSON.parse(opts.resendOptions)

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
