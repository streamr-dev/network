const { Benchmark } = require('benchmark')
const { ethers } = require('ethers')

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist/streamr-client')
const config = require('../integration/config')

const client1 = new StreamrClient({
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: true,
    ...config.clientOptions
})

const client2 = new StreamrClient({
    auth: {
        apiKey: 'tester1-api-key'
    },
    publishWithSignature: 'never',
    autoConnect: true,
    ...config.clientOptions
})

const msg = {
    msg: 'test'
}

async function run() {
    let stream1
    await client1.getOrCreateStream({
        name: 'node-example-data',
    }).then((stream) => {
        stream1 = stream
    })

    let stream2
    await client2.getOrCreateStream({
        name: 'node-example-data',
    }).then((stream) => {
        stream2 = stream
    })

    const suite = new Benchmark.Suite()
    suite.add('client publishing with signing', {
        defer: true,
        fn(deferred) {
            stream1.publish(msg).then(() => deferred.resolve())
        }
    })

    suite.add('client publishing without signing', {
        defer: true,
        fn(deferred) {
            stream2.publish(msg).then(() => deferred.resolve())
        }
    })

    suite.on('cycle', (event) => {
        console.log(String(event.target))
    })

    suite.on('complete', async function () {
        console.log('Fastest is ' + this.filter('fastest').map('name'))
        console.log('Disconnecting clients')
        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
    })

    suite.run()
}

run()
