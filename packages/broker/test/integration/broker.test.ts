import { startTracker, Tracker } from 'streamr-network'
import fetch from 'node-fetch'
import { Wallet } from 'ethers'
import { wait, waitForCondition } from 'streamr-test-utils'
import {
    createClient,
    createTestStream,
    getPrivateKey,
    startBroker,
    StorageAssignmentEventManager,
    until,
    waitForStreamPersistedInStorageNode
} from '../utils'
import StreamrClient, { Stream, StreamOperation } from 'streamr-client'
import { Broker } from '../broker'

const httpPort = 12341
const wsPort1 = 12351
const wsPort2 = 12352
const wsPort3 = 12353
const trackerPort = 12370

jest.setTimeout(6000000)

describe('broker: end-to-end', () => {
    let tracker: Tracker
    let storageNode: Broker
    let brokerNode1: Broker
    let brokerNode2: Broker
    let client1: StreamrClient
    let client2: StreamrClient
    let client3: StreamrClient
    let freshStream: Stream
    let freshStreamId: string
    let assignmentEventManager: StorageAssignmentEventManager

    beforeAll(async () => {
        const storageNodeAccount = new Wallet(await getPrivateKey())
        const engineAndEditorAccount = new Wallet(await getPrivateKey())
        const storageNodeRegistry = {
            contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
            jsonRpcProvider: `http://10.200.10.1:8546`
        }
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: trackerPort
            },
            id: 'tracker-1'
        })
        const storageNodeClient = new StreamrClient({
            auth: {
                privateKey: storageNodeAccount.privateKey
            },
        })
        await storageNodeClient.setNode('http://127.0.0.1:' + httpPort)
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            httpPort: httpPort,
            wsPort: wsPort1,
            streamrAddress: engineAndEditorAccount.address,
            enableCassandra: true,
            storageNodeConfig: { registry: storageNodeRegistry }
        })
        brokerNode1 = await startBroker({
            name: 'brokerNode1',
            privateKey: await getPrivateKey(),
            trackerPort,
            wsPort: wsPort2,
            streamrAddress: engineAndEditorAccount.address,
            enableCassandra: false,
            storageNodeConfig: { registry: storageNodeRegistry }
        })
        brokerNode2 = await startBroker({
            name: 'brokerNode2',
            privateKey: await getPrivateKey(),
            trackerPort,
            wsPort: wsPort3,
            streamrAddress: engineAndEditorAccount.address,
            enableCassandra: false,
            storageNodeConfig: { registry: storageNodeRegistry }
        })

        // Create clients
        const user1 = new Wallet(await getPrivateKey())
        const user2 = new Wallet(await getPrivateKey())
        client1 = createClient(tracker, user1.privateKey, {
            storageNodeRegistry,
        })
        client2 = createClient(tracker, user1.privateKey, {
            storageNodeRegistry,
        })
        client3 = createClient(tracker, user2.privateKey, {
            storageNodeRegistry,
        })
        assignmentEventManager = new StorageAssignmentEventManager(tracker, engineAndEditorAccount, storageNodeAccount)
        await assignmentEventManager.createStream()

        // Set up stream
        freshStream = await createTestStream(client1, module)
        freshStreamId = freshStream.id
        await assignmentEventManager.addStreamToStorageNode(freshStreamId, storageNodeAccount.address, client1)
        await waitForStreamPersistedInStorageNode(freshStreamId, 0, '127.0.0.1', httpPort)
        await freshStream.grantUserPermission(StreamOperation.STREAM_SUBSCRIBE, user2.address)
    })

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            client1.disconnect(),
            client2.disconnect(),
            client3.disconnect(),
            storageNode.stop(),
            brokerNode1.stop(),
            brokerNode2.stop(),
            assignmentEventManager.close(),
        ])
    })

    it('happy-path: real-time websocket producing and websocket consuming (unsigned messages)', async () => {
        const client1Messages: any[] = []
        const client2Messages: any[] = []
        const client3Messages: any[] = []

        const subs = await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStreamId
            }, (message) => {
                client2Messages.push(message)
            }),
            client3.subscribe({
                stream: freshStreamId
            }, (message) => {
                client3Messages.push(message)
            })
        ])

        await Promise.all(subs.map((sub) => sub.waitForNeighbours()))

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
        const client1Messages: any[] = []
        const client2Messages: any[] = []
        const client3Messages: any[] = []

        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStreamId
            }, (message) => {
                client2Messages.push(message)
            }),
            client3.subscribe({
                stream: freshStreamId
            }, (message) => {
                client3Messages.push(message)
            })
        ])

        for (let i = 1; i <= 3; ++i) {
            client1.publish(freshStream, JSON.stringify({
                key: i
            }))
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
        const subs = await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, () => {}),
            client2.subscribe({
                stream: freshStreamId
            }, () => {}),
            client3.subscribe({
                stream: freshStreamId
            }, () => {}),
        ])

        await Promise.all(subs.map((sub) => sub.waitForNeighbours()))

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

        await wait(3000) // wait for propagation

        const client1Messages: any[] = []
        const client2Messages: any[] = []
        const client3Messages: any[] = []

        await Promise.all([
            client1.resend({
                stream: freshStreamId,
                resend: {
                    last: 2
                }
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.resend({
                stream: freshStreamId,
                resend: {
                    last: 2
                }
            }, (message) => {
                client2Messages.push(message)
            }),
            client3.resend({
                stream: freshStreamId,
                resend: {
                    last: 2
                }
            }, (message) => {
                client3Messages.push(message)
            })
        ])

        await waitForCondition(() => client2Messages.length === 2 && client3Messages.length === 2, 10000)
        await waitForCondition(() => client1Messages.length === 2, 10000)

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
        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, () => {}),
            client2.subscribe({
                stream: freshStreamId
            }, () => {}),
            client3.subscribe({
                stream: freshStreamId
            }, () => {}),
        ])

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

        const client1Messages: any[] = []
        const client2Messages: any[] = []
        const client3Messages: any[] = []
        await Promise.all([
            client1.resend({
                stream: freshStreamId,
                resend: {
                    from: {
                        timestamp: timeAfterFirstMessagePublished,
                    }
                }
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.resend({
                stream: freshStreamId,
                resend: {
                    from: {
                        timestamp: timeAfterFirstMessagePublished,
                    }
                }
            }, (message) => {
                client2Messages.push(message)
            }),
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
        ])

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
        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, () => {}),
            client2.subscribe({
                stream: freshStreamId
            }, () => {}),
            client3.subscribe({
                stream: freshStreamId
            }, () => {}),
        ])

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

        const client1Messages: any[] = []
        const client2Messages: any[] = []
        const client3Messages: any[] = []

        await Promise.all([
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
            }),

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
            }),

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
        ])

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
        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, () => {}),
            client2.subscribe({
                stream: freshStreamId
            }, () => {}),
            client3.subscribe({
                stream: freshStreamId
            }, () => {}),
        ])

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

        await wait(3000) // wait for propagation
        const url = `http://localhost:${httpPort}/api/v1/streams/${encodeURIComponent(freshStreamId)}/data/partitions/0/last?count=2`
        const response = await fetch(url, {
            method: 'get',
        })
        const messagesAsObjects = await response.json()
        const messageContents = messagesAsObjects.map((msgAsObject: any) => msgAsObject.content)

        expect(messageContents).toEqual([
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

        await wait(8000)

        // eslint-disable-next-line max-len
        const url = `http://localhost:${httpPort}/api/v1/streams/${encodeURIComponent(freshStreamId)}/data/partitions/0/from?fromTimestamp=${fromTimestamp}`
        const response = await fetch(url, {
            method: 'get',
        })
        const messagesAsObjects = await response.json()
        const messages = messagesAsObjects.map((msgAsObject: any) => msgAsObject.content)

        expect(sentMessages).toEqual(messages)
    })

    it('broker returns [] for empty http resend', async () => {
        const fromTimestamp = Date.now() + 99999999
        // eslint-disable-next-line max-len
        const url = `http://localhost:${httpPort}/api/v1/streams/${encodeURIComponent(freshStreamId)}/data/partitions/0/from?fromTimestamp=${fromTimestamp}`
        const response = await fetch(url, {
            method: 'get',
        })
        const messagesAsObjects = await response.json()
        expect(messagesAsObjects).toEqual([])
    })

    it('happy-path: resend from request via http', async () => {
        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, () => {}),
            client2.subscribe({
                stream: freshStreamId
            }, () => {}),
            client3.subscribe({
                stream: freshStreamId
            }, () => {}),
        ])

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

        const url = `http://localhost:${httpPort}/api/v1/streams/${encodeURIComponent(freshStreamId)}/data/partitions/0/from`
            + `?fromTimestamp=${timeAfterFirstMessagePublished}`
        const response = await fetch(url, {
            method: 'get',
        })
        const messagesAsObjects = await response.json()
        const messageContents = messagesAsObjects.map((msgAsObject: any) => msgAsObject.content)

        expect(messageContents).toEqual([
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
        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, () => {}),
            client2.subscribe({
                stream: freshStreamId
            }, () => {}),
            client3.subscribe({
                stream: freshStreamId
            }, () => {}),
        ])

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

        const url = `http://localhost:${httpPort}/api/v1/streams/${encodeURIComponent(freshStreamId)}/data/partitions/0/range`
            + `?fromTimestamp=${timeAfterFirstMessagePublished}`
            + `&toTimestamp=${timeAfterThirdMessagePublished}`
        const response = await fetch(url, {
            method: 'get',
        })
        const messagesAsObjects = await response.json()
        const messageContents = messagesAsObjects.map((msgAsObject: any) => msgAsObject.content)

        expect(messageContents).toEqual([
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })
})
