import assert from 'assert'
import sinon from 'sinon'

import {
    WebsocketResponse,
    UnicastMessage,
    StreamMessage,
    Errors,
} from 'streamr-client-protocol'

import Connection from '../../src/Connection'

describe('Connection', () => {
    let conn
    beforeEach(() => {
        conn = new Connection({
            url: 'foo',
        }, {
            close: sinon.mock(),
        })
    })

    afterEach(() => {
    })

    describe('initial state', () => {
        it('should be correct', () => {
            assert.equal(conn.state, Connection.State.DISCONNECTED)
        })
    })

    describe('connect()', () => {
        it('returns a promise and resolves it when connected', () => {
            const result = conn.connect()
            assert(result instanceof Promise)
            conn.socket.onopen()
            return result
        })

        it('adds listeners to socket', () => {
            conn.connect()
            assert(conn.socket.onopen != null)
            assert(conn.socket.onclose != null)
            assert(conn.socket.onmessage != null)
        })

        it('should report correct state when connecting', () => {
            conn.connect()
            assert.equal(conn.state, Connection.State.CONNECTING)
        })

        it('should report correct state flag when connected', () => {
            conn.connect()
            conn.socket.onopen()
            assert.equal(conn.state, Connection.State.CONNECTED)
        })

        it('should reject the promise if already connected', (done) => {
            conn.connect()
            conn.socket.onopen()
            assert.equal(conn.state, Connection.State.CONNECTED)

            conn.connect().catch(() => {
                assert.equal(conn.state, Connection.State.CONNECTED)
                done()
            })
        })

        it('should not resolve the promise multiple times', (done) => {
            conn.connect().then(done) // will complain if done is called multiple times
            conn.socket.onopen()
            conn.socket.onopen()
        })
    })

    describe('disconnect()', () => {
        beforeEach(() => {
            conn.connect()
            conn.socket.onopen()
            assert.equal(conn.state, Connection.State.CONNECTED)
        })

        it('returns a promise and resolves it when disconnected', () => {
            const result = conn.disconnect()
            assert(result instanceof Promise)
            conn.socket.onclose()
            return result
        })

        it('should call socket.close()', () => {
            conn.disconnect()
            assert(conn.socket.close.calledOnce)
        })

        it('should report correct state when disconnecting', () => {
            conn.disconnect()
            assert.equal(conn.state, Connection.State.DISCONNECTING)
        })

        it('should report correct state flag when connected', () => {
            conn.disconnect()
            conn.socket.onclose()
            assert.equal(conn.state, Connection.State.DISCONNECTED)
        })

        it('should reject the promise if already disconnected', (done) => {
            conn.disconnect()
            conn.socket.onclose()
            assert.equal(conn.state, Connection.State.DISCONNECTED)

            conn.disconnect().catch(() => {
                assert.equal(conn.state, Connection.State.DISCONNECTED)
                done()
            })
        })

        it('should not resolve the promise multiple times', (done) => {
            conn.disconnect().then(done) // will complain if done is called multiple times
            conn.socket.onclose()
            conn.socket.onclose()
        })
    })

    describe('send()', () => {
        beforeEach(() => {
            conn.connect()
        })

        it('sends the serialized message over the socket', () => {
            const request = {
                serialize: sinon.stub().returns('foo'),
            }
            conn.socket.send = sinon.stub()

            conn.send(request)
            assert(request.serialize.calledOnce)
            assert(conn.socket.send.calledWith('foo'))
        })

        it('emits error event if socket.send throws', (done) => {
            const request = {
                serialize: sinon.stub(),
            }
            conn.socket.send = sinon.stub().throws(new Error('test'))

            conn.on('error', (err) => {
                assert.equal(err.message, 'test')
                done()
            })
            conn.send(request)
        })
    })

    describe('event handling on socket', () => {
        beforeEach(() => {
            conn.connect()
            conn.socket.onopen()
        })

        describe('message', () => {
            it('emits events named by messateTypeName and the WebsocketResponse as an argument', (done) => {
                conn.on('UnicastMessage', (message) => {
                    assert(message instanceof UnicastMessage)
                    assert.equal(message.payload.offset, 10)
                    assert.equal(message.payload.getParsedContent().hello, 'world')
                    assert.equal(message.subId, 'subId')
                    done()
                })

                const message = new UnicastMessage(
                    new StreamMessage('streamId', 0, Date.now(), 0, 10, 9, 27, {
                        hello: 'world',
                    }),
                    'subId',
                )

                conn.socket.onmessage({
                    data: message.serialize(),
                })
            })

            it('emits an error event when a message contains invalid json', (done) => {
                conn.on('error', (err) => {
                    assert(err instanceof Errors.InvalidJsonError)
                    done()
                })

                const message = new UnicastMessage(
                    new StreamMessage('streamId', 0, Date.now(), 0, 10, 9, 27, 'invalid json'),
                    'subId',
                )

                conn.socket.onmessage({
                    data: message.serialize(),
                })
            })
        })

        describe('close', () => {
            let clock
            beforeAll(() => {
                clock = sinon.useFakeTimers()
            })

            afterAll(() => {
                clock.restore()
            })

            it('tries to reconnect after 2 seconds', () => {
                conn.connect = sinon.stub()
                conn.socket.events.emit('close')
                clock.tick(2100)
                assert(conn.connect.calledOnce)
            })
        })
    })
})
