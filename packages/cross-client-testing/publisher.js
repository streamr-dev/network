import { StreamrClient } from 'streamr-client'
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

process.on('beforeExit', () => {
    process.stderr.write(`Exiting.`)
})

const options = {
    restUrl: "http://localhost/api/v1",
    url: "ws://localhost/api/v1/ws",
    autoDisconnect: false,
    autoConnect: false,
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
        client.debug('rotateGroupKey >>')
        await client.rotateGroupKey(streamId)
        client.debug('rotateGroupKey <<')
    }
    await defaultPublishFunction(msgToPublish, counter)
}

const nbMessagesBetweenRevokes = 7
const nbMessagesForSingleKey = 5

const revokingPublishFunction = async (msgToPublish, counter) => {
    if ((counter % nbMessagesBetweenRevokes) === 0) {
        client.debug("revoking with a rekey >>")
        await client.rekey(streamId)
        client.debug("revoking with a rekey <<")
    } else if ((counter % nbMessagesForSingleKey) === 0) {
        client.debug('rotateGroupKey >>')
        await client.rotateGroupKey(streamId)
        client.debug('rotateGroupKey <<')
    }

    return defaultPublishFunction(msgToPublish, counter)
}

const defaultPublishFunction = async (msgToPublish, _counter) => {
    try {
        await client.publish(streamId, msgToPublish)
        client.debug('Published: ', msgToPublish)
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
} else if (publishFunctionName === 'revoking') {
    publishFunction = revokingPublishFunction
}

let Counter = 0
const publishMessage = async (address) => {
    const counter = Counter++
    const msg = {
        "counter": counter,
        "client-implementation": "Javascript",
        "publisher": address,
        "string-key": Math.random().toString(36).substr(2, 5),
        "integer-key": Math.floor(Math.random() * 100),
        "double-key": Math.random(),
        "array-key": [4, -5, 19]
    }
    console.log('Going to publish: ', JSON.stringify(msg))
    await publishFunction(msg, counter)

    if (maxMessages && counter >= maxMessages - 1) {
        console.log(`Done: All ${maxMessages} messages published.`)
        // Disconnect gracefully so that this process will quit.
        // Don't do it immediately to avoid messing up the last published message in any way.
        await wait(10000 + (500 * maxMessages))
        console.info(`Disconnecting publisher...`)
        await client.disconnect()
        console.log(`Disconnected.`)
    } else {
        setTimeout(() => publishMessage(address), interval)
    }
}

// disable autoconnect/disconnect
client.connect().then(async () => {
    publishMessage(await client.getAddress())
})
