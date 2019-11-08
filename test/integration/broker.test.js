const { exec } = require('child_process')

const WebSocket = require('ws')
const { startTracker } = require('streamr-network')
const StreamrClient = require('streamr-client')
const fetch = require('node-fetch')
const { wait, waitForCondition } = require('streamr-test-utils')

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

// The index for content/body/payload in array response of HTTP resend requests
const CONTENT_IDX_IN_ARRAY = 5

function startBroker(id, httpPort, wsPort, networkPort, enableCassandra, privateKeyFileName, certFileName) {
    return createBroker({
        network: {
            id,
            hostname: '127.0.0.1',
            port: networkPort,
            advertisedWsUrl: null,
            tracker: `ws://127.0.0.1:${trackerPort}`,
            isStorageNode: false
        },
        cassandra: enableCassandra ? {
            hosts: ['localhost'],
            username: '',
            password: '',
            keyspace: 'streamr_dev',
        } : false,
        reporting: false,
        streamrUrl: 'http://localhost:8081/streamr-core',
        adapters: [
            {
                name: 'ws',
                port: wsPort,
                privateKeyFileName,
                certFileName
            },
            {
                name: 'http',
                port: httpPort,
            },
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

describe('ws and wss connections', () => {
    it('can connect to ws endpoint', async (done) => {
        const broker = await startBroker('broker1', httpPort1, wsPort1, networkPort1, true)
        const ws = new WebSocket(`ws://127.0.0.1:${wsPort1}/api/v1/ws`)
        ws.on('open', async () => {
            ws.terminate()
            await broker.close()
            done()
        })
        ws.on('error', (err) => done(err))
    })
    it('can connect to wss endpoint', async (done) => {
        const command = 'openssl req -x509 -newkey rsa:4096 -keyout test_key.pem -out test_cert.pem -days 365 -nodes -subj \'/CN=localhost\''
        await exec(command, async () => {
            const broker = await startBroker('broker1', httpPort1, wsPort1, networkPort1, true, 'test_key.pem', 'test_cert.pem')
            const ws = new WebSocket(`wss://127.0.0.1:${wsPort1}/api/v1/ws`, {
                rejectUnauthorized: false // needed to accept self-signed certificate
            })
            ws.on('open', async () => {
                ws.terminate()
                await broker.close()
                done()
            })
            ws.on('error', (err) => done(err))
        })
    }, 40000)
})

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

    beforeAll(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        broker1 = await startBroker('broker1', httpPort1, wsPort1, networkPort1, true)
        broker2 = await startBroker('broker2', httpPort2, wsPort2, networkPort2, true)
        broker3 = await startBroker('broker3', httpPort3, wsPort3, networkPort3, true)

        client1 = createClient(wsPort1, 'tester1-api-key')
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        client2 = createClient(wsPort2, 'tester1-api-key')
        await wait(100) // TODO: remove when StaleObjectStateException is fixed in E&E
        client3 = createClient(wsPort3, 'tester2-api-key') // different api key

        freshStream = await client1.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id

        await freshStream.grantPermission('read', 'tester2@streamr.com')
    }, 10 * 1000)

    afterAll(async () => {
        await Promise.all([
            tracker.stop(),
            client1.ensureDisconnected(),
            client2.ensureDisconnected(),
            client3.ensureDisconnected(),
            broker1.close(),
            broker2.close(),
            broker3.close()
        ])
    })

    it('happy-path: real-time websocket producing and websocket consuming', async () => {
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []

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

        await wait(1000)

        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })

        await waitForCondition(() => client2Messages.length === 3 && client3Messages.length === 3)
        await waitForCondition(() => client1Messages.length === 3)

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
    })

    it('happy-path: real-time HTTP producing and websocket consuming', async () => {
        const client1Messages = []
        const client2Messages = []
        const client3Messages = []

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

        for (let i = 1; i <= 3; ++i) {
            // eslint-disable-next-line no-await-in-loop
            const n = await fetch(`http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/data`, {
                method: 'post',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
                body: JSON.stringify({
                    key: i
                })
            })
        }

        await waitForCondition(() => client2Messages.length === 3 && client3Messages.length === 3)
        await waitForCondition(() => client1Messages.length === 3)

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
    })

    it('happy-path: resend last request via websocket', async () => {
        client1.subscribe({
            stream: freshStreamId
        }, () => {})

        client2.subscribe({
            stream: freshStreamId
        }, () => {})

        client3.subscribe({
            stream: freshStreamId
        }, () => {})

        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })
        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(1500) // wait for propagation

        const client1Messages = []
        const client2Messages = []
        const client3Messages = []

        client1.resend({
            stream: freshStreamId,
            resend: {
                last: 2
            }
        }, (message) => {
            client1Messages.push(message)
        })

        client2.resend({
            stream: freshStreamId,
            resend: {
                last: 2
            }
        }, (message) => {
            client2Messages.push(message)
        })

        client3.resend({
            stream: freshStreamId,
            resend: {
                last: 2
            }
        }, (message) => {
            client3Messages.push(message)
        })

        await waitForCondition(() => client2Messages.length === 2 && client3Messages.length === 2)
        await waitForCondition(() => client1Messages.length === 2)

        expect(client1Messages).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client3Messages).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])
    })

    it('happy-path: resend from request via websocket', async () => {
        client1.subscribe({
            stream: freshStreamId
        }, () => {})

        client2.subscribe({
            stream: freshStreamId
        }, () => {})

        client3.subscribe({
            stream: freshStreamId
        }, () => {})

        await client1.publish(freshStreamId, {
            key: 1
        })
        await wait(50)
        const timeAfterFirstMessagePublished = Date.now()

        await client1.publish(freshStreamId, {
            key: 2
        })
        await wait(50)
        await client1.publish(freshStreamId, {
            key: 3
        })
        await wait(50)
        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(1500) // wait for propagation

        const client1Messages = []
        const client2Messages = []
        const client3Messages = []

        client1.resend({
            stream: freshStreamId,
            resend: {
                from: {
                    timestamp: timeAfterFirstMessagePublished,
                }
            }
        }, (message) => {
            client1Messages.push(message)
        })

        client2.resend({
            stream: freshStreamId,
            resend: {
                from: {
                    timestamp: timeAfterFirstMessagePublished,
                }
            }
        }, (message) => {
            client2Messages.push(message)
        })

        client3.resend({
            stream: freshStreamId,
            resend: {
                from: {
                    timestamp: timeAfterFirstMessagePublished,
                }
            }
        }, (message) => {
            client3Messages.push(message)
        })

        await waitForCondition(() => client2Messages.length === 3 && client3Messages.length === 3)
        await waitForCondition(() => client1Messages.length === 3)

        expect(client1Messages).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(client3Messages).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])
    })

    it('happy-path: resend range request via websocket', async () => {
        client1.subscribe({
            stream: freshStreamId
        }, () => {})

        client2.subscribe({
            stream: freshStreamId
        }, () => {})

        client3.subscribe({
            stream: freshStreamId
        }, () => {})

        await client1.publish(freshStreamId, {
            key: 1
        })
        await wait(50)
        const timeAfterFirstMessagePublished = Date.now()

        await client1.publish(freshStreamId, {
            key: 2
        })
        await wait(50)
        await client1.publish(freshStreamId, {
            key: 3
        })
        await wait(25)
        const timeAfterThirdMessagePublished = Date.now()
        await wait(25)

        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(1500) // wait for propagation

        const client1Messages = []
        const client2Messages = []
        const client3Messages = []

        client1.resend({
            stream: freshStreamId,
            resend: {
                from: {
                    timestamp: timeAfterFirstMessagePublished,
                },
                to: {
                    timestamp: timeAfterThirdMessagePublished,
                }
            }
        }, (message) => {
            client1Messages.push(message)
        })

        client2.resend({
            stream: freshStreamId,
            resend: {
                from: {
                    timestamp: timeAfterFirstMessagePublished,
                },
                to: {
                    timestamp: timeAfterThirdMessagePublished,
                }
            }
        }, (message) => {
            client2Messages.push(message)
        })

        client3.resend({
            stream: freshStreamId,
            resend: {
                from: {
                    timestamp: timeAfterFirstMessagePublished,
                },
                to: {
                    timestamp: timeAfterThirdMessagePublished,
                }
            }
        }, (message) => {
            client3Messages.push(message)
        })

        await waitForCondition(() => client2Messages.length === 2 && client3Messages.length === 2)
        await waitForCondition(() => client1Messages.length === 2)

        expect(client1Messages).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client3Messages).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })

    it('happy-path: resend last request via http', async () => {
        client1.subscribe({
            stream: freshStreamId
        }, () => {})

        client2.subscribe({
            stream: freshStreamId
        }, () => {})

        client3.subscribe({
            stream: freshStreamId
        }, () => {})

        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })
        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(1500) // wait for propagation

        const jsons = await Promise.all([httpPort1, httpPort2, httpPort3].map(async (httpPort) => {
            const url = `http://localhost:${httpPort}/api/v1/streams/${freshStreamId}/data/partitions/0/last?count=2`
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
            })
            const messagesAsArrays = await response.json()
            return messagesAsArrays.map((msgAsArr) => JSON.parse(msgAsArr[CONTENT_IDX_IN_ARRAY]))
        }))

        expect(jsons[0]).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(jsons[1]).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(jsons[2]).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])
    })

    it('happy-path: resend from request via http', async () => {
        client1.subscribe({
            stream: freshStreamId
        }, () => {})

        client2.subscribe({
            stream: freshStreamId
        }, () => {})

        client3.subscribe({
            stream: freshStreamId
        }, () => {})

        await client1.publish(freshStreamId, {
            key: 1
        })
        await wait(50)
        const timeAfterFirstMessagePublished = Date.now()

        await client1.publish(freshStreamId, {
            key: 2
        })
        await wait(50)
        await client1.publish(freshStreamId, {
            key: 3
        })
        await wait(50)
        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(1500) // wait for propagation

        const jsons = await Promise.all([httpPort1, httpPort2, httpPort3].map(async (httpPort) => {
            const url = `http://localhost:${httpPort}/api/v1/streams/${freshStreamId}/data/partitions/0/from`
                + `?fromTimestamp=${timeAfterFirstMessagePublished}`
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
            })
            const messagesAsArrays = await response.json()
            return messagesAsArrays.map((msgAsArr) => JSON.parse(msgAsArr[CONTENT_IDX_IN_ARRAY]))
        }))

        expect(jsons[0]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(jsons[1]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(jsons[2]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
            {
                key: 4
            },
        ])
    })

    it('happy-path: resend range request via http', async () => {
        client1.subscribe({
            stream: freshStreamId
        }, () => {})

        client2.subscribe({
            stream: freshStreamId
        }, () => {})

        client3.subscribe({
            stream: freshStreamId
        }, () => {})

        await client1.publish(freshStreamId, {
            key: 1
        })
        await wait(50)
        const timeAfterFirstMessagePublished = Date.now()

        await client1.publish(freshStreamId, {
            key: 2
        })
        await wait(50)
        await client1.publish(freshStreamId, {
            key: 3
        })
        await wait(25)
        const timeAfterThirdMessagePublished = Date.now()
        await wait(25)

        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(1500) // wait for propagation

        const jsons = await Promise.all([httpPort1, httpPort2, httpPort3].map(async (httpPort) => {
            const url = `http://localhost:${httpPort}/api/v1/streams/${freshStreamId}/data/partitions/0/range`
                + `?fromTimestamp=${timeAfterFirstMessagePublished}`
                + `&toTimestamp=${timeAfterThirdMessagePublished}`
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
            })
            const messagesAsArrays = await response.json()
            return messagesAsArrays.map((msgAsArr) => JSON.parse(msgAsArr[CONTENT_IDX_IN_ARRAY]))
        }))

        expect(jsons[0]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(jsons[1]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(jsons[2]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })
})
