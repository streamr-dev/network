const { startTracker } = require('@streamr/streamr-p2p-network')
const StreamrClient = require('streamr-client')
const fetch = require('node-fetch')
const mqtt = require('mqtt')
const createBroker = require('../../src/broker')

const httpPort1 = 12341
const httpPort2 = 12342
const httpPort3 = 12343
const wsPort1 = 12351
const wsPort2 = 12352
const wsPort3 = 12353
const networkPort1 = 12361
const networkPort2 = 12362
const networkPort3 = 12363
const trackerPort = 12370
const testApiKey = 'tester1-api-key'
const mqttPort1 = 12551
const mqttPort2 = 12552
const mqttPort3 = 12553

// Copy-paste from network, should maybe consider packaging into library?
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitForCondition = (conditionFn, timeout = 10 * 1000, retryInterval = 100) => {
    if (conditionFn()) {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const refs = {}

        refs.timeOut = setTimeout(() => {
            clearInterval(refs.interval)
            reject(new Error('waitForCondition: timed out before condition became true'))
        }, timeout)

        refs.interval = setInterval(() => {
            if (conditionFn()) {
                clearTimeout(refs.timeOut)
                clearInterval(refs.interval)
                resolve()
            }
        }, retryInterval)
    })
}

function startBroker(id, httpPort, wsPort, networkPort, mqttPort, enableCassandra) {
    return createBroker({
        network: {
            id,
            hostname: '127.0.0.1',
            port: networkPort,
            tracker: `ws://127.0.0.1:${trackerPort}`,
        },
        cassandra: enableCassandra ? {
            hosts: [
                'localhost',
            ],
            username: '',
            password: '',
            keyspace: 'streamr_dev',
        } : false,
        streamrUrl: 'http://localhost:8081/streamr-core',
        adapters: [
            {
                name: 'ws',
                port: wsPort,
            },
            {
                name: 'http',
                port: httpPort,
            },
            {
                name: 'mqtt',
                port: mqttPort,
                streamsTimeout: 300000
            }
        ],
    })
}

function createClient(wsPort, apiKey) {
    return new StreamrClient({
        url: `ws://localhost:${wsPort}/api/v1/ws`,
        restUrl: 'http://localhost:8081/streamr-core/api/v1',
        auth: {
            apiKey
        }
    })
}

function createMqttClient(mqttPort = 9000, host = 'localhost', apiKey = 'tester1-api-key') {
    return mqtt.connect({
        hostname: host,
        port: mqttPort,
        username: '',
        password: apiKey
    })
}

describe('broker: end-to-end', () => {
    let tracker
    let broker1
    let broker2
    let broker3
    let client1
    let client2
    let client3
    let freshStream
    let freshStreamId
    let freshStreamName

    let mqttClient

    beforeAll(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        broker1 = await startBroker('broker1', httpPort1, wsPort1, networkPort1, mqttPort1, true)
        broker2 = await startBroker('broker2', httpPort2, wsPort2, networkPort2, mqttPort2, true)
        broker3 = await startBroker('broker3', httpPort3, wsPort3, networkPort3, mqttPort3, true)

        client1 = createClient(wsPort1, 'tester1-api-key')
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        client2 = createClient(wsPort2, 'tester1-api-key')
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        client3 = createClient(wsPort3, 'tester2-api-key') // different api key
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E

        mqttClient = createMqttClient(mqttPort1)
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E

        freshStream = await client1.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id
        freshStreamName = freshStream.name
    })

    afterAll(async () => {
        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
        await client3.ensureDisconnected()
        broker1.close()
        broker2.close()
        broker3.close()
        tracker.close()

        mqttClient.destroy()
    })

    it('happy-path: real-time websocket producing and websocket consuming', async () => {
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []
        const client4Messages = []

        await freshStream.grantPermission('read', 'tester2@streamr.com')

        client1.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client1Messages.push(message)
        })

        client2.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client2Messages.push(message)
        })

        client3.subscribe({
            stream: freshStreamId
        }, (message, metadata) => {
            client3Messages.push(message)
        })

        mqttClient.subscribe(freshStreamName)
        mqttClient.on('message', (topic, message) => {
            if (topic === freshStreamName) {
                client4Messages.push(JSON.parse(message.toString('utf8')))
            }
        })

        // client.publish(newStreamName, 'test message', {
        //     qos: 1
        // }, (err) => {
        //     if (err) {
        //         console.warn(err)
        //     }
        //     client.end()
        // })

        // mqttClient.on('connect', () => {
        //     mqttClient.subscribe(newStreamName)
        //
        //     client.on('message', (topic, message) => {
        //         // message is Buffer
        //         console.log(message.toString())
        //         client.end()
        //     })
        //
        //     client.publish(newStreamName, 'test message', {
        //         qos: 1
        //     }, (err) => {
        //         if (err) {
        //             console.warn(err)
        //         }
        //         client.end()
        //     })
        // })
        // client.on('error', (err) => {
        //     console.warn(err)
        //     client.end()
        // })

        await wait(1000) // TODO: seems like this is needed for subscribes to go thru?
        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })

        await waitForCondition(() => client2Messages.length === 3)

        expect(client1Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client3Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client4Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })

    // it('happy-path: real-time websocket producing and websocket consuming', async (done) => {
    //     const client1Messages = []
    //     const client2Messages = []
    //     const client3Messages = []
    //
    //     await freshStream.grantPermission('read', 'tester2@streamr.com')
    //
    //     client1.subscribe({
    //         stream: freshStreamId
    //     }, (message, metadata) => {
    //         client1Messages.push(message)
    //     })
    //
    //     client2.subscribe({
    //         stream: freshStreamId
    //     }, (message, metadata) => {
    //         client2Messages.push(message)
    //     })
    //
    //     client3.subscribe({
    //         stream: freshStreamId
    //     }, (message, metadata) => {
    //         client3Messages.push(message)
    //     })
    //
    //     await wait(1000) // TODO: seems like this is needed for subscribes to go thru?
    //     await client1.publish(freshStreamId, {
    //         key: 1
    //     })
    //     await client1.publish(freshStreamId, {
    //         key: 2
    //     })
    //     await client1.publish(freshStreamId, {
    //         key: 3
    //     })
    //
    //     await waitForCondition(() => client2Messages.length === 3)
    //
    //     expect(client1Messages).toEqual([
    //         {
    //             key: 1
    //         },
    //         {
    //             key: 2
    //         },
    //         {
    //             key: 3
    //         },
    //     ])
    //
    //     expect(client2Messages).toEqual([
    //         {
    //             key: 1
    //         },
    //         {
    //             key: 2
    //         },
    //         {
    //             key: 3
    //         },
    //     ])
    //
    //     expect(client3Messages).toEqual([
    //         {
    //             key: 1
    //         },
    //         {
    //             key: 2
    //         },
    //         {
    //             key: 3
    //         },
    //     ])
    //     // const client = createMqttClient()
    //     // client.on('connect', () => {
    //     //     client.subscribe(newStreamName)
    //     //
    //     //     client.on('message', (topic, message) => {
    //     //         // message is Buffer
    //     //         console.log(message.toString())
    //     //         client.end()
    //     //     })
    //     //
    //     //     client.publish(newStreamName, 'test message', {
    //     //         qos: 1
    //     //     }, (err) => {
    //     //         if (err) {
    //     //             console.warn(err)
    //     //         }
    //     //         client.end()
    //     //     })
    //     // })
    //     // client.on('error', (err) => {
    //     //     console.warn(err)
    //     //     client.end()
    //     // })
    //
    //     // const client1Messages = []
    //     // const client2Messages = []
    //     // const client3Messages = []
    //     //
    //     // await newStream.grantPermission('read', 'tester2@streamr.com')
    //     //
    //     // client1.subscribe({
    //     //     stream: newStreamId
    //     // }, (message, metadata) => {
    //     //     client1Messages.push(message)
    //     // })
    //     //
    //     // client2.subscribe({
    //     //     stream: newStreamId
    //     // }, (message, metadata) => {
    //     //     client2Messages.push(message)
    //     // })
    //     //
    //     // client3.subscribe({
    //     //     stream: newStreamId
    //     // }, (message, metadata) => {
    //     //     client3Messages.push(message)
    //     // })
    //     //
    //     // await wait(1000) // TODO: seems like this is needed for subscribes to go thru?
    //     // await client1.publish(newStreamId, {
    //     //     key: 1
    //     // })
    //     // await client1.publish(newStreamId, {
    //     //     key: 2
    //     // })
    //     // await client1.publish(newStreamId, {
    //     //     key: 3
    //     // })
    //     //
    //     // await waitForCondition(() => client2Messages.length === 3)
    //     //
    //     // expect(client1Messages).toEqual([
    //     //     {
    //     //         key: 1
    //     //     },
    //     //     {
    //     //         key: 2
    //     //     },
    //     //     {
    //     //         key: 3
    //     //     },
    //     // ])
    //     //
    //     // expect(client2Messages).toEqual([
    //     //     {
    //     //         key: 1
    //     //     },
    //     //     {
    //     //         key: 2
    //     //     },
    //     //     {
    //     //         key: 3
    //     //     },
    //     // ])
    //     //
    //     // expect(client3Messages).toEqual([
    //     //     {
    //     //         key: 1
    //     //     },
    //     //     {
    //     //         key: 2
    //     //     },
    //     //     {
    //     //         key: 3
    //     //     },
    //     // ])
    // }, 50000)
})
