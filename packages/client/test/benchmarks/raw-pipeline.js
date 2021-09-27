const { format } = require('util')
const { Benchmark } = require('benchmark')
const { randomBytes } = require('crypto')
const { humanize } = require('debug')
const bytes = require('bytes')

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist')

const { StorageNode, ConfigTest: clientOptions } = StreamrClient

function randomString(bytes) {
    let buffer = randomBytes(bytes)
    while (Buffer.byteLength(buffer.toString('utf8')) > bytes) {
        buffer = buffer.slice(0, buffer.length - 1)
    }
    return buffer.toString('utf8')
}

const randomStrings = new Map()
function cachedRandomString(bytes) {
    if (!randomStrings.has(bytes)) {
        randomStrings.set(bytes, randomString(bytes))
    }
    return randomStrings.get(bytes)

}
// note this is not the number of messages, just the start number
let count = 0 // pedantic: use large initial number so payload size is similar

const Msg = (bytes) => {
    count += 1
    return {
        id: `msg${count}`,
        data: cachedRandomString(bytes),
    }
}

function createClient(opts) {
    return new StreamrClient({
        ...clientOptions,
        ...opts,
    })
}

async function setupClientAndStream(clientOpts, streamOpts) {
    const client = createClient(clientOpts)
    await client.connect()
    await client.session.getSessionToken()

    const stream = await client.createStream({
        id: `/test-stream-resend/${process.pid}`,
        ...streamOpts,
    })
    await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
    return [client, stream]
}

const BATCH_SIZES = [
    //128,
    1024,
    //2048,
    //4096,
]

const PAYLOAD_SIZES = [
    32, // 32b
    256, // 0.25kb
    1024, // 1kb
    //2 * 1024, // 2kb
    //16 * 1024, // 16 kb
    //128 * 1024, // 128 kb
]

const TOTAL_MESSAGES = BATCH_SIZES[BATCH_SIZES.length - 1]

const log = (...args) => process.stderr.write(format(...args) + '\n')

async function run() {
    const suite = new Benchmark.Suite()

    async function publish(client, stream, batchSize, payloadBytes) {
        const node = await client.getNode()
        node.publish = async (msg) => msg
        node.subscribe = () => {}
        node.unsubscribe = () => {}
        const startTime = Date.now()
        try {
            log('publishing %d %s messages to %s >>', batchSize, bytes(payloadBytes), stream.id)
            const published = await client.collectMessages(client.publishFrom(stream, (async function* Generate() {
                for (let i = 0; i < batchSize; i++) {
                    yield Msg(payloadBytes)
                }
            }())), batchSize)
            return published
        } finally {
            log('publishing %d %s messages to %s: %dms <<', batchSize, bytes(payloadBytes), stream.id, Date.now() - startTime)
        }
    }

    async function mockSubMessages(client, streamMessages) {
        const node = await client.getNode()
        try {
            for (const streamMessage of streamMessages) {
                // clone because pipeline mutates messages
                node.emit('streamr:node:unseen-message-received', streamMessage.clone())
            }
        } catch (err) {
            log('mockSubMessages error', err)
        }
    }

    async function test(client, stream, batchSize, payloadBytes, streamMessages) {
        return async function Fn(deferred) {
            try {
                const sub = await client.subscribe(stream)
                const tasks = [
                    sub.collect(batchSize),
                    mockSubMessages(client, streamMessages.slice(0, batchSize)),
                ]
                this.BATCH_SIZE = batchSize
                this.PAYLOAD_BYTES = payloadBytes
                this.TOTAL_BYTES = this.TOTAL_BYTES || 0
                let subMessagesBytes = 0
                streamMessages.slice(0, batchSize).forEach((msg) => {
                    subMessagesBytes += Buffer.byteLength(msg.getSerializedContent())
                })
                this.TOTAL_BYTES += subMessagesBytes
                this.MESSAGES_BYTES = this.MESSAGES_BYTES || []
                this.MESSAGES_BYTES.push(subMessagesBytes)
                await Promise.allSettled(tasks)
                await Promise.all(tasks)
                await sub.unsubscribe()
                deferred.resolve()
            } catch (err) {
                deferred.resolve(err)
            }
        }
    }

    async function setup(clientOptions, streamOptions) {
        const account = StreamrClient.generateEthereumAccount()
        const [client, stream] = await setupClientAndStream({
            auth: {
                privateKey: account.privateKey,
            },
            ...clientOptions
        }, streamOptions)

        suite.on('complete', () => {
            client.destroy().catch(() => {})
        })

        return [client, stream]
    }

    log('setting up...')
    log('using mocked network node')
    const [[client1, stream1], [client2, stream2]] = await Promise.all([
        setup({
            publishWithSignature: 'always',
        }, {
            requireEncryptedData: false,
        }),
        setup({
            publishWithSignature: 'always',
        }, {
            requireEncryptedData: true,
        })
    ])

    for (const payloadBytes of PAYLOAD_SIZES) {
        const published = await Promise.all([
            publish(client1, stream1, TOTAL_MESSAGES, payloadBytes),
            publish(client2, stream2, TOTAL_MESSAGES, payloadBytes),
        ])

        for (const batchSize of BATCH_SIZES) {
            suite.add(`subscribe pipeline of ${batchSize} x ${bytes(payloadBytes)} messages without encryption`, {
                defer: true,
                fn: await test(client1, stream1, batchSize, payloadBytes, published[0])
            })

            suite.add(`subscribe pipeline of ${batchSize} x ${bytes(payloadBytes)} messages with encryption`, {
                defer: true,
                fn: await test(client2, stream2, batchSize, payloadBytes, published[1])
            })
        }
    }

    log('set up complete')
    function toStringBench(bench) {
        const { error, id, stats } = bench
        let { hz } = bench
        const benchHz = hz
        hz *= bench.BATCH_SIZE // adjust hz by batch size
        const size = stats.sample.length
        const pm = '\xb1'
        let result = bench.name || (Number.isNaN(id) ? id : '<Test #' + id + '>')
        if (error) {
            return result + ' Error'
        }
        const avgMsgsBytes = bench.MESSAGES_BYTES.reduce((a, b) => a + b, 0) / bench.MESSAGES_BYTES.length
        const bytesPerSecond = avgMsgsBytes * benchHz
        // const msgsPerSecond = (1000 * bench.times.period) / bench.BATCH_SIZE
        // log(bench)
        result += ' x ' + Benchmark.formatNumber(hz.toFixed(hz < 100 ? 2 : 0)) + ' msgs/sec '
            + `(${bytes(bench.TOTAL_BYTES)} at ${bytes(bytesPerSecond)}/sec) `
            + pm + stats.rme.toFixed(2) + '% (' + size + ' run' + (size === 1 ? '' : 's') + ' sampled)'
        return result
    }

    suite.on('cycle', (event) => {
        log(toStringBench(event.target))
    })

    log('starting')
    suite.run()
}

run().catch((err) => {
    log(err)
    process.exit(1)
})

