import assert from 'assert'
import sinon from 'sinon'

import Connection from '../../src/Connection'
import InvalidJsonError from '../../src/errors/InvalidJsonError'

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

        it('emits error event if socket.send throws', (done) => {
            conn.socket.send = sinon.stub().throws()

            const msg = {}
            conn.on('error', () => {
                done()
            })
            conn.send(msg)
        })
    })

    describe('message handling on socket', () => {
        beforeEach(() => {
            conn.connect()
            conn.socket.onopen()
        })

        it('emits decoded messages', (done) => {
            conn.on('b', (decodedMessage) => {
                assert.equal(decodedMessage.offset, 3445690152)
                done()
            })
            conn.socket.onmessage({
                data: JSON.stringify([0, 0, '',
                    [28, 'L9xDhrevS_CE3_OA6pLVuQ', 0, 1538926879033, 0,
                        3445690152, 3445690148, 27,
                        JSON.stringify({
                            t: 'p', id: 437.0, lat: 60.16314, lng: 24.908923, color: 'rgba(233, 87, 15, 1.0)',
                        })]]),
            })
        })

        it('emits an error event when a message contains invalid json', (done) => {
            conn.on('error', (err) => {
                assert(err instanceof InvalidJsonError)
                done()
            })
            conn.socket.onmessage({
                data: JSON.stringify([0, 0, '',
                    [28, 'L9xDhrevS_CE3_OA6pLVuQ', 0, 1538926879033, 0, 3445690152, 3445690148, 27, 'invalid json']]),
            })
        })
    })
})
