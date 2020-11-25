const { Benchmark } = require('benchmark')
const { ethers } = require('ethers')
/* eslint-disable no-console */

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist/streamr-client.nodejs.js')
const config = require('../integration/config')

const client1 = new StreamrClient({
    ...config.clientOptions,
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    publishWithSignature: 'always',
})

const client2 = new StreamrClient({
    ...config.clientOptions,
    auth: {
        apiKey: 'tester1-api-key'
    },
    publishWithSignature: 'never',
})

let count = 100000
const Msg = () => {
    count += 1
    return {
        msg: `test${count}`
    }
}

async function run() {
    await client1.connect()
    await client1.session.getSessionToken()
    await client2.connect()
    await client2.session.getSessionToken()
    const stream1 = await client1.createStream({
        name: `node-example-data1.${process.pid}`,
    })

    const stream2 = await client2.getOrCreateStream({
        name: `node-example-data2.${process.pid}`,
    })

    const suite = new Benchmark.Suite()
    suite.add('client publishing with signing', {
        defer: true,
        fn(deferred) {
            // eslint-disable-next-line promise/catch-or-return
            stream1.publish(Msg()).then(() => deferred.resolve(), () => deferred.resolve())
        }
    })

    suite.add('client publishing without signing', {
        defer: true,
        fn(deferred) {
            // eslint-disable-next-line promise/catch-or-return
            stream2.publish(Msg()).then(() => deferred.resolve(), () => deferred.resolve())
        }
    })

    suite.on('cycle', (event) => {
        console.log(String(event.target))
    })

    suite.on('complete', async function onComplete() {
        console.log('Fastest is ' + this.filter('fastest').map('name'))
        console.log('Disconnecting clients')
        await Promise.all([
            client1.disconnect(),
            client2.disconnect(),
        ])
        console.log('Clients disconnected')
    })

    suite.run()
}

run()
