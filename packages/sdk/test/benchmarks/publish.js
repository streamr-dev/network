const { format } = require('util')
const { Benchmark } = require('benchmark')

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist')

// note this is not the number of messages, just the start number
let count = 100000 // pedantic: use large initial number so payload size is similar
const Msg = () => {
    count += 1
    return {
        msg: `msg${count}`
    }
}

async function getPrivateKey() {
    const response = await fetch('http://localhost:45454/key')
    return response.text()
}

async function createClient(opts) {
    return new StreamrClient({
        environnment: 'dev2',
        ...opts,
        auth: {
            privateKey: await getPrivateKey()
        }
    })
}

async function setupClientAndStream(clientOpts, streamOpts) {
    const client = await createClient(clientOpts)
    await client.connect()

    const stream = await client.createStream({
        id: `/test-stream-publish/${process.pid}`,
        ...streamOpts
    })
    return [client, stream]
}

const BATCH_SIZES = [1, 4, 16, 64]

const log = (...args) => process.stderr.write(format(...args) + '\n')

async function run() {
    const account1 = StreamrClient.generateEthereumAccount()
    const [client1, stream1] = await setupClientAndStream({
        auth: {
            privateKey: account1.privateKey
        }
    })

    const account2 = StreamrClient.generateEthereumAccount()
    const [client2, stream2] = await setupClientAndStream({
        auth: {
            privateKey: account2.privateKey
        }
    })

    const account3 = StreamrClient.generateEthereumAccount()
    const [client3, stream3] = await setupClientAndStream(
        {
            auth: {
                privateKey: account3.privateKey
            }
        },
        {
            requiresEncryption: true
        }
    )

    const suite = new Benchmark.Suite()

    async function publish(stream, batchSize) {
        const tasks = []
        for (let i = 0; i < batchSize; i++) {
            tasks.push(stream.publish(Msg()))
        }
        return Promise.all(tasks)
    }

    BATCH_SIZES.forEach((batchSize) => {
        suite.add(`client publishing in batches of ${batchSize} with signing`, {
            defer: true,
            fn(deferred) {
                this.BATCH_SIZE = batchSize
                return publish(stream1, batchSize).then(
                    () => deferred.resolve(),
                    () => deferred.resolve()
                )
            }
        })

        suite.add(`client publishing in batches of ${batchSize} without signing`, {
            defer: true,
            fn(deferred) {
                this.BATCH_SIZE = batchSize
                return publish(stream2, batchSize).then(
                    () => deferred.resolve(),
                    () => deferred.resolve()
                )
            }
        })

        suite.add(`client publishing in batches of ${batchSize} with encryption`, {
            defer: true,
            fn(deferred) {
                this.BATCH_SIZE = batchSize
                return publish(stream3, batchSize).then(
                    () => deferred.resolve(),
                    () => deferred.resolve()
                )
            }
        })
    })

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

    suite.on('complete', async () => {
        log('Destroying clients')
        const tasks = [client1.destroy(), client2.destroy(), client3.destroy()]
        await Promise.allSettled(tasks)
        await Promise.all(tasks)
        log('Clients destroyed')
    })

    suite.run()
}

run()
