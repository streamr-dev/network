import 'babel-polyfill' // Needed because of mocha
import assert from 'assert'
import fetch from 'node-fetch'

import StreamrClient from '../../src'

describe('StreamrClient', function () {
    this.timeout(10 * 1000)

    const dataApi = 'localhost:8890'
    const engineAndEditor = 'localhost:8081/streamr-core'
    const name = `StreamrClient-integration-${Date.now()}`

    let client
    let createdStream

    const createClient = (opts = {}) => new StreamrClient({
        url: `ws://${dataApi}/api/v1/ws`,
        restUrl: `http://${engineAndEditor}/api/v1`,
        apiKey: 'tester1-api-key',
        ...opts,
    })

    before(() => Promise.all([ // TODO: Figure out how to handle this when setting up a CI
        fetch(`http://${engineAndEditor}`),
        fetch(`http://${dataApi}`),
    ])
        .catch((e) => {
            if (e.errno === 'ENOTFOUND' || e.errno === 'ECONNREFUSED') {
                throw new Error('Integration testing requires that engine-and-editor ' +
                    'and data-api ("entire stack") are running in the background. ' +
                    'Instructions: https://github.com/streamr-dev/streamr-docker-dev#running')
            } else {
                throw e
            }
        }))

    beforeEach(() => {
        client = createClient()
    })

    afterEach((done) => {
        if (client && client.isConnected()) {
            client.once('disconnected', done)
            client.disconnect()
            client = null
        } else {
            client = null
            done()
        }
    })

    describe('Stream creation', () => {
        it('createStream', () => client.createStream({
            name,
        })
            .then((stream) => {
                createdStream = stream
                assert(stream.id)
                assert.equal(stream.name, name)
            }))

        it('getOrCreate an existing Stream', () => client.getOrCreateStream({
            name,
        })
            .then((existingStream) => {
                assert.equal(existingStream.id, createdStream.id)
                assert.equal(existingStream.name, createdStream.name)
            }))

        it('getOrCreate a new Stream', () => {
            const newName = Date.now()
                .toString()
            return client.getOrCreateStream({
                name: newName,
            })
                .then((newStream) => {
                    assert.notEqual(newStream.id, createdStream.id)
                })
        })
    })

    describe('Stream.update', () => {
        it('can change stream name', () => {
            createdStream.name = 'New name'
            return createdStream.update()
        })
    })

    describe('Data production', () => {

        it('Stream.produce', () => createdStream.produce({
            foo: 'bar',
            count: 0,
        }))

        it('client.produceToStream', () => client.produceToStream(createdStream.id, {
            foo: 'bar',
            count: 0,
        }))

        it('client.produceToStream with Stream object as arg', () => client.produceToStream(createdStream, {
            foo: 'bar',
            count: 0,
        }))

        it('client.subscribe with resend', (done) => {
            // This test needs some time because the write needs to have time to go to Cassandra
            setTimeout(() => {
                client.subscribe({
                    stream: createdStream.id,
                    resend_last: 1,
                }, (message) => {
                    done()
                })
            }, 5000)
        })

        it('client.subscribe (realtime)', (done) => {
            // Hack due to not having nginx in front: produce call needs to go to data-api port
            client.options.restUrl = `http://${dataApi}/api/v1`

            const id = Date.now()

            const sub = client.subscribe({
                stream: createdStream.id,
            }, (message) => {
                assert.equal(message.id, id)
                done()
            })

            sub.on('subscribed', () => {
                createdStream.produce({
                    id,
                })
            })
        })
    })

    describe('Stream configuration', () => {
        it('Stream.detectFields', () =>
            // What does this return?
            createdStream.detectFields().then((stream) => {
                assert.deepEqual(
                    stream.config.fields,
                    [
                        {
                            name: 'foo',
                            type: 'string',
                        },
                        {
                            name: 'count',
                            type: 'number',
                        },
                    ],
                )
            }))
    })

    describe('Stream permissions', () => {
        it('Stream.getPermissions', () => createdStream.getPermissions().then((permissions) => {
            assert.equal(permissions.length, 3) // read, write, share for the owner
        }))
    })

    describe('Stream deletion', () => {
        it('Stream.delete', () => createdStream.delete())
    })
})
