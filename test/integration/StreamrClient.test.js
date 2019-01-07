import assert from 'assert'
import fetch from 'node-fetch'
import Web3 from 'web3'

import StreamrClient from '../../src'
import config from './config'

/**
 * These tests should be run in sequential order!
 */
describe('StreamrClient', () => {
    const name = `StreamrClient-integration-${Date.now()}`

    let client

    const createClient = (opts = {}) => new StreamrClient({
        url: `${config.websocketUrl}?payloadVersion=29`,
        restUrl: config.restUrl,
        auth: {
            privateKey: new Web3().eth.accounts.create().privateKey,
        },
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => Promise.all([
        fetch(config.restUrl),
        fetch(config.websocketUrl.replace('ws://', 'http://')),
    ])
        .then(() => {
            client = createClient()
            return client.connect()
        })
        .catch((e) => {
            if (e.errno === 'ENOTFOUND' || e.errno === 'ECONNREFUSED') {
                throw new Error('Integration testing requires that engine-and-editor ' +
                    'and data-api ("entire stack") are running in the background. ' +
                    'Instructions: https://github.com/streamr-dev/streamr-docker-dev#running')
            } else {
                throw e
            }
        }))

    afterAll((done) => {
        if (client && client.isConnected()) {
            client.disconnect().then(done)
        } else {
            done()
        }
    })

    describe('Pub/Sub', () => {
        let createdStream

        beforeAll(() => {
            assert(client.isConnected())
            return client.createStream({
                name,
                requireSignedData: true,
            }).then((stream) => {
                createdStream = stream
                assert(createdStream.id)
                assert.equal(createdStream.name, name)
                assert.strictEqual(createdStream.requireSignedData, true)
            }).catch((err) => { throw err })
        })

        it('Stream.publish', () => createdStream.publish({
            test: 'Stream.publish',
        }))

        it('client.publish', () => client.publish(createdStream.id, {
            test: 'client.publish',
        }))

        it('client.publish with Stream object as arg', () => client.publish(createdStream, {
            test: 'client.publish with Stream object as arg',
        }))

        it('client.subscribe with resend', (done) => {
            // This test needs some time because the write needs to have time to go to Cassandra
            let streamMessage
            assert.strictEqual(client.subscribedStreams[createdStream.id], undefined)
            setTimeout(() => {
                const sub = client.subscribe({
                    stream: createdStream.id,
                    resend_last: 1,
                }, async () => {
                    const subStream = client.subscribedStreams[createdStream.id]
                    const publishers = await subStream.getPublishers()
                    const requireVerification = await subStream.getVerifySignatures()
                    assert.strictEqual(requireVerification, true)
                    assert.deepStrictEqual(publishers, [client.signer.address.toLowerCase()])
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        assert.strictEqual(client.subscribedStreams[createdStream.id], undefined)
                        done()
                    })
                })
                client.connection.on('UnicastMessage', (msg) => {
                    streamMessage = msg.payload
                    assert.strictEqual(streamMessage.parsedContent.test, 'client.publish with Stream object as arg')
                    assert.strictEqual(streamMessage.signatureType, 1)
                    assert(streamMessage.publisherAddress)
                    assert(streamMessage.signature)
                })
            }, 10000)
        }, 15000)

        it('client.subscribe (realtime)', (done) => {
            let streamMessage
            const id = Date.now()

            // Make a new stream for this test to avoid conflicts
            client.getOrCreateStream({
                name: `StreamrClient client.subscribe (realtime) - ${Date.now()}`,
            }).then((stream) => {
                const sub = client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    assert.equal(message.id, id)
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        done()
                    })
                })
                sub.on('subscribed', () => {
                    stream.publish({
                        id,
                    })
                })
            })
            client.connection.on('BroadcastMessage', (msg) => {
                streamMessage = msg.payload
                assert.strictEqual(streamMessage.parsedContent.id, id)
                assert.strictEqual(streamMessage.signatureType, 1)
                assert(streamMessage.publisherAddress)
                assert(streamMessage.signature)
            })
        })
    })
})
