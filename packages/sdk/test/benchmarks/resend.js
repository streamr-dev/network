/* eslint-disable @typescript-eslint/no-require-imports */
const { format } = require('util')
const { Benchmark } = require('benchmark')
const { randomBytes } = require('crypto')
const bytes = require('bytes')

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist')

const { StorageNode } = StreamrClient
async function getPrivateKey() {
    const response = await fetch('http://localhost:45454/key')
    return response.text()
}

async function createClient(opts) {
    return new StreamrClient({
        environment: 'dev2',
        auth: {
            privateKey: await getPrivateKey()
        },
        ...opts
    })
}

// note this is not the number of messages, just the start number
let count = 0 // pedantic: use large initial number so payload size is similar
const Msg = (bytes) => {
    count += 1
    return {
        id: `msg${count}`,
        data: randomBytes(bytes)
    }
}

async function setupClientAndStream(clientOpts, streamOpts) {
    const client = await createClient(clientOpts)
    await client.connect()

    const stream = await client.createStream({
        id: `/test-stream-resend/${process.pid}`,
        ...streamOpts
    })
    await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
    return [client, stream]
}

const BATCH_SIZES = [
    1024
    // 2048,
    // 4096,
]

const PAYLOAD_SIZES = [
    // 32, // 32b
    1024 // 1kb
    // 128 * 1024, // 128 kb
]

const TOTAL_MESSAGES = BATCH_SIZES[BATCH_SIZES.length - 1]

const log = (...args) => process.stderr.write(format(...args) + '\n')

async function run() {
    const suite = new Benchmark.Suite()

    async function publish(client, stream, batchSize, payloadBytes) {
        const startTime = Date.now()
        try {
            log('publishing %d %s messages to %s >>', batchSize, bytes(payloadBytes), stream.id)
            const published = await client.collectMessages(
                client.publishFrom(
                    stream,
                    (async function* Generate() {
                        for (let i = 0; i < batchSize; i++) {
                            yield Msg(payloadBytes)
                        }
                    })()
                ),
                batchSize
            )
            await client.waitForStorage(published[published.length - 1], { timeout: 60000, count: 1000 })
            const s = JSON.stringify(published[0])
            log(bytes(Buffer.byteLength(s)), s, published[0])
            return published
        } finally {
            log(
                'publishing %d %s messages to %s: %dms <<',
                batchSize,
                bytes(payloadBytes),
                stream.id,
                Date.now() - startTime
            )
        }
    }

    async function test(client, stream, batchSize) {
        return async function Fn(deferred) {
            this.BATCH_SIZE = batchSize
            const sub = await client.resend(stream.id, {
                last: batchSize
            })
            await sub.collect(batchSize)
            deferred.resolve()
        }
    }

    async function setup(clientOptions, streamOptions) {
        const account = StreamrClient.generateEthereumAccount()
        const [client, stream] = await setupClientAndStream(
            {
                auth: {
                    privateKey: account.privateKey
                },
                ...clientOptions
            },
            streamOptions
        )

        suite.on('complete', () => {
            client.destroy().catch(() => {})
        })

        return [client, stream]
    }

    log('setting up...')
    const [[client1, stream1], [client2, stream2]] = await Promise.all([setup(), setup()])

    for (const payloadBytes of PAYLOAD_SIZES) {
        const published = await Promise.all([
            publish(client1, stream1, TOTAL_MESSAGES, payloadBytes),
            publish(client2, stream2, TOTAL_MESSAGES, payloadBytes)
        ])

        for (const batchSize of BATCH_SIZES) {
            suite.add(
                `client resend last ${bytes(payloadBytes)} messages in batches of ${batchSize} without encryption`,
                {
                    defer: true,
                    fn: await test(client1, stream1, batchSize)
                }
            )

            suite.add(`client resend last ${bytes(payloadBytes)} messages in batches of ${batchSize} with encryption`, {
                defer: true,
                fn: await test(client2, stream2, batchSize)
            })
        }
    }

    log('set up complete')
    function toStringBench(bench) {
        const { error, id, stats } = bench
        let { hz } = bench
        hz *= bench.BATCH_SIZE // adjust hz by batch size
        const size = stats.sample.length
        const pm = '\xb1'
        let result = bench.name || (Number.isNaN(id) ? id : '<Test #' + id + '>')
        if (error) {
            return result + ' Error'
        }

        result +=
            ' x ' +
            Benchmark.formatNumber(hz.toFixed(hz < 100 ? 2 : 0)) +
            ' ops/sec ' +
            pm +
            stats.rme.toFixed(2) +
            '% (' +
            size +
            ' run' +
            (size === 1 ? '' : 's') +
            ' sampled)'
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
