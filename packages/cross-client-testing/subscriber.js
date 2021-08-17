import { StreamrClient } from 'streamr-client'
const opts = JSON.parse(process.argv[2])

const {
    privateKey,
    streamId,
} = opts

const groupKey = opts.groupKey ? JSON.parse(opts.groupKey) : undefined
const resendOptions = opts.resendOptions === 'real-time' ? undefined : JSON.parse(opts.resendOptions)

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
client.connect().then(async () => {
    const onMessage = (streamMessage) => {
        // to be logged in test mode
        console.log(`whole message received: ${streamMessage.serialize()}`)
        // to be added by SubscriberJS to the message queue for verification in test mode
        console.log(`Received: ${streamMessage.getPublisherId()}###${streamMessage.getSerializedContent()}`)
    }

    const realtimeSub = await client.subscribe({ stream: streamId })
    if (resendOptions) {
        const resendSub = await client.resend({ stream: streamId, resend: resendOptions })
        await resendSub.consume(onMessage)
    }
    await realtimeSub.consume(onMessage)
})
