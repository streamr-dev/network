import { StreamrClient, ConfigTest as defaultOptions } from 'streamr-client'
process.title = 'node subscriber.js'
const opts = JSON.parse(process.argv[2])

const {
    privateKey,
    streamId,
} = opts

const groupKey = opts.groupKey ? JSON.parse(opts.groupKey) : undefined
const resendOptions = opts.resendOptions === 'real-time' ? undefined : JSON.parse(opts.resendOptions)

const options = {
    ...defaultOptions,
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
client.connect().then(async () => {
    const onMessage = (streamMessage) => {
        // to be logged in test mode
        console.log(`whole message received: ${streamMessage.serialize()}`)
        // to be added by SubscriberJS to the message queue for verification in test mode
        console.log(`Received: ${streamMessage.getPublisherId()}###${streamMessage.getSerializedContent()}`)
    }
    const options = { stream: streamId }
    if (resendOptions) {
        options.resend = resendOptions
    }
    const realtimeSub = await client.subscribe(options)
    await realtimeSub.consume(onMessage)
})
