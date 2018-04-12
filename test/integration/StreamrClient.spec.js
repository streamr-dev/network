const assert = require('assert')

const StreamrClient = require('../../src/index')

describe('StreamrClient', function () {
    this.timeout(10 * 1000)

    const dataApi = 'localhost:8890'
    const engineAndEditor = 'localhost:8081/streamr-core'
    const name = `StreamrClient-integration-${Date.now()}`

    let client
    let createdStream

    const defaultOptions = {
        url: `ws://${dataApi}/api/v1/ws`,
        restUrl: `http://${engineAndEditor}/api/v1`,
        apiKey: 'tester1-api-key',
    }

    function createClient(opts = {}) {
        opts = Object.assign({}, defaultOptions, opts)
        return new StreamrClient(opts)
    }

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
        let originalClient
        let dataApiClient

        before('Hack: Create new client with data-api port as restUrl, because we dont have nginx in front', () => {
            if (!createdStream._client) {
                throw 'Test broken: Assumption about implementation internals is wrong'
            }
            originalClient = createdStream._client
            createdStream._client = dataApiClient = createClient({
                restUrl: `http://${dataApi}/api/v1`,
            })
        })

        after('Restore above hack', () => {
            if (originalClient) {
                createdStream._client = originalClient
            }
        })

        it('Stream.produce', () => createdStream.produce({
            foo: 'bar',
            count: 0,
        }))

        it('client.produceToStream', () => dataApiClient.produceToStream(createdStream.id, {
            foo: 'bar',
            count: 0,
        }))

        it('client.produceToStream with Stream object as arg', () => dataApiClient.produceToStream(createdStream, {
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
