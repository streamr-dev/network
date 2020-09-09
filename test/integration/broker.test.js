const WebSocket = require('ws')
const { startTracker } = require('streamr-network')
const fetch = require('node-fetch')
const { wait, waitForCondition } = require('streamr-test-utils')

const { startBroker, createClient, getWsUrl } = require('../utils')

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

describe('websocket server', () => {
    let ws
    let broker

    afterEach(async () => {
        if (ws) {
            ws.terminate()
        }
        await broker.close()
    })

    it('receives unencrypted connections', async (done) => {
        broker = await startBroker('broker1', networkPort1, trackerPort, httpPort1, wsPort1, null, false)
        ws = new WebSocket(getWsUrl(wsPort1))
        ws.on('open', async () => {
            done()
        })
        ws.on('error', (err) => done(err))
    })

    it('receives encrypted connections', async (done) => {
        broker = await startBroker('broker1', networkPort1, trackerPort, httpPort1, wsPort1, null, false, 'test/fixtures/key.pem', 'test/fixtures/cert.pem')
        ws = new WebSocket(getWsUrl(wsPort1, true), {
            rejectUnauthorized: false // needed to accept self-signed certificate
        })
        ws.on('open', async () => {
            done()
        })
        ws.on('error', (err) => done(err))
    })

    describe('rejections', () => {
        const testRejection = async (connectionUrl) => {
            broker = await startBroker('broker1', networkPort1, trackerPort, httpPort1, wsPort1, null, false)
            ws = new WebSocket(connectionUrl)
            let gotError = false
            let closed = false
            ws.on('open', () => {
                throw new Error('Websocket should not have opened!')
            })
            ws.on('error', (err) => {
                if (err.message.includes('400')) {
                    gotError = true
                } else {
                    throw new Error(`Got unexpected error message: ${err.message}`)
                }
            })
            ws.on('close', () => {
                closed = true
            })
            await waitForCondition(() => gotError && closed)
        }

        it('rejects connections without preferred versions given as query parameters', async () => {
            await testRejection(`ws://127.0.0.1:${wsPort1}/api/v1/ws`)
        })

        it('rejects connections with unsupported ControlLayer version', async () => {
            await testRejection(getWsUrl(wsPort1, false, 666, 31))
        })

        it('rejects connections with unsupported MessageLayer version', async () => {
            await testRejection(getWsUrl(wsPort1, false, 1, 666))
        })
    })
})

describe('broker: end-to-end', () => {
    let tracker
    let broker1
    let broker2
    let broker3
    let client1
    let client2
    let client3
    // let client4
    let freshStream
    let freshStreamId

    beforeAll(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        broker1 = await startBroker('broker1', networkPort1, trackerPort, httpPort1, wsPort1, null, true)
        broker2 = await startBroker('broker2', networkPort2, trackerPort, httpPort2, wsPort2, null, true)
        broker3 = await startBroker('broker3', networkPort3, trackerPort, httpPort3, wsPort3, null, true)

        client1 = createClient(wsPort1)
        client2 = createClient(wsPort2)
        client3 = createClient(wsPort3, {
            auth: {
                apiKey: 'tester2-api-key' // different api key
            }
        })

        // const ethereumAccount = StreamrClient.generateEthereumAccount()
        // client4 = createClient(wsPort1, {
        //     auth: {
        //         privateKey: ethereumAccount.privateKey // this client signs published messages
        //     }
        // })
        // await client4.session.getSessionToken() // avoid race condition vs grantPermission. TODO: remove when fixed in EE

        freshStream = await client1.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id

        await freshStream.grantPermission('stream_get', 'tester2@streamr.com')
        await freshStream.grantPermission('stream_subscribe', 'tester2@streamr.com')
        // await freshStream.grantPermission('stream_get', ethereumAccount.address)
        // await freshStream.grantPermission('stream_subscribe', ethereumAccount.address)
        // await freshStream.grantPermission('stream_publish', ethereumAccount.address)
    }, 10 * 1000)

    afterAll(async () => {
        await tracker.stop()
        await client1.ensureDisconnected()
        await client2.ensureDisconnected()
        await client3.ensureDisconnected()
        // await client4.ensureDisconnected()
        await broker1.close()
        await broker2.close()
        await broker3.close()
    })

    it('happy-path: real-time websocket producing and websocket consuming (unsigned messages)', async () => {
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

    // it('happy-path: real-time websocket producing and websocket consuming (signed messages)', async () => {
    //     const client1Messages = []
    //     const client2Messages = []
    //     const client4Messages = []
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
    //     client4.subscribe({
    //         stream: freshStreamId
    //     }, (message, metadata) => {
    //         client4Messages.push(message)
    //     })
    //
    //     await wait(1000)
    //
    //     await client4.publish(freshStreamId, {
    //         key: 1
    //     })
    //     await client4.publish(freshStreamId, {
    //         key: 2
    //     })
    //     await client4.publish(freshStreamId, {
    //         key: 3
    //     })
    //
    //     await waitForCondition(() => client2Messages.length === 3 && client4Messages.length === 3)
    //     await waitForCondition(() => client1Messages.length === 3)
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
    //     expect(client4Messages).toEqual([
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
    // })

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
            await fetch(`http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/data`, {
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

        const messageContents = await Promise.all([httpPort1, httpPort2, httpPort3].map(async (httpPort) => {
            const url = `http://localhost:${httpPort}/api/v1/streams/${freshStreamId}/data/partitions/0/last?count=2`
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
            })
            const messagesAsObjects = await response.json()
            return messagesAsObjects.map((msgAsObject) => msgAsObject.content)
        }))

        expect(messageContents[0]).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(messageContents[1]).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])

        expect(messageContents[2]).toEqual([
            {
                key: 3
            },
            {
                key: 4
            },
        ])
    })

    it('broker streams long resend from request via http', async () => {
        const fromTimestamp = Date.now()

        const sentMessages = []
        for (let i = 0; i < 50; i++) {
            const msg = {
                key: i
            }
            // eslint-disable-next-line no-await-in-loop
            await client1.publish(freshStreamId, msg)
            sentMessages.push(msg)
        }

        await wait(3000)

        const url = `http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/data/partitions/0/from?fromTimestamp=${fromTimestamp}`
        const response = await fetch(url, {
            method: 'get',
            headers: {
                Authorization: 'token tester1-api-key'
            },
        })
        const messagesAsObjects = await response.json()
        const messages = messagesAsObjects.map((msgAsObject) => msgAsObject.content)

        expect(sentMessages).toEqual(messages)
    })

    it('broker returns [] for empty http resend', async () => {
        const fromTimestamp = Date.now() + 99999999
        const url = `http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/data/partitions/0/from?fromTimestamp=${fromTimestamp}`
        const response = await fetch(url, {
            method: 'get',
            headers: {
                Authorization: 'token tester1-api-key'
            },
        })
        const messagesAsObjects = await response.json()
        expect(messagesAsObjects).toEqual([])
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

        const messageContents = await Promise.all([httpPort1, httpPort2, httpPort3].map(async (httpPort) => {
            const url = `http://localhost:${httpPort}/api/v1/streams/${freshStreamId}/data/partitions/0/from`
                + `?fromTimestamp=${timeAfterFirstMessagePublished}`
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
            })
            const messagesAsObjects = await response.json()
            return messagesAsObjects.map((msgAsObject) => msgAsObject.content)
        }))

        expect(messageContents[0]).toEqual([
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

        expect(messageContents[1]).toEqual([
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

        expect(messageContents[2]).toEqual([
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

        const messageContents = await Promise.all([httpPort1, httpPort2, httpPort3].map(async (httpPort) => {
            const url = `http://localhost:${httpPort}/api/v1/streams/${freshStreamId}/data/partitions/0/range`
                + `?fromTimestamp=${timeAfterFirstMessagePublished}`
                + `&toTimestamp=${timeAfterThirdMessagePublished}`
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    Authorization: 'token tester1-api-key'
                },
            })
            const messagesAsObjects = await response.json()
            return messagesAsObjects.map((msgAsObject) => msgAsObject.content)
        }))

        expect(messageContents[0]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(messageContents[1]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(messageContents[2]).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })
})
