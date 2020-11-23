const { Benchmark } = require('benchmark')
const { ethers } = require('ethers')

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist/streamr-client.nodejs.js')
const config = require('../integration/config')

const client1 = new StreamrClient({
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    ...config.clientOptions
})

const client2 = new StreamrClient({
    auth: {
        apiKey: 'tester1-api-key'
    },
    publishWithSignature: 'never',
    ...config.clientOptions
})

const msg = {
    msg: 'test'
}

async function run() {
    await client1.connect()
    await client2.connect()
    const stream1 = await client1.getOrCreateStream({
        name: 'node-example-data',
    })

    const stream2 = await client2.getOrCreateStream({
        name: 'node-example-data',
    })

    const suite = new Benchmark.Suite()
    suite.add('client publishing with signing', {
        defer: true,
        fn(deferred) {
            // eslint-disable-next-line promise/catch-or-return
            stream1.publish(msg).then(() => deferred.resolve(), () => deferred.resolve())
        }
    })

    suite.add('client publishing without signing', {
        defer: true,
        fn(deferred) {
            // eslint-disable-next-line promise/catch-or-return
            stream2.publish(msg).then(() => deferred.resolve(), () => deferred.resolve())
        }
    })

    suite.on('cycle', (event) => {
        // eslint-disable-next-line no-console
        console.log(String(event.target))
    })

    suite.on('complete', async function onComplete() {
        // eslint-disable-next-line no-console
        console.log('Fastest is ' + this.filter('fastest').map('name'))
        // eslint-disable-next-line no-console
        console.log('Disconnecting clients')
        await Promise.all([
            client1.disconnect(),
            client2.disconnect(),
        ])
        // eslint-disable-next-line no-console
        console.log('Clients disconnected')
    })

    suite.run()
}

run()
