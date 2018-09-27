import assert from 'assert'
import sinon from 'sinon'

import Connection from '../../src/Connection'

describe('Connection', () => {
    let conn

    beforeEach(() => {
        conn = new Connection({
            url: 'foo',
            socket: {},
        })
    })

    afterEach(() => {
    })

    describe('initial state', () => {
        it('should be correct', () => {
            assert.equal(conn.state, Connection.State.DISCONNECTED)
        })
    })

    describe('connect', () => {
        beforeEach(() => {
            conn.connect()
        })

        it('creates a socket', () => {
            assert(conn.socket != null)
        })

        it('adds listeners to socket', () => {
            assert(conn.socket.onopen != null)
            assert(conn.socket.onclose != null)
            assert(conn.socket.onmessage != null)
        })

        it('should report correct state when connecting', () => {
            assert.equal(conn.state, Connection.State.CONNECTING)
        })

        it('should report correct state flag when connected', () => {
            conn.socket.onopen()
            assert.equal(conn.state, Connection.State.CONNECTED)
        })
    })

    describe('send', () => {
        beforeEach(() => {
            conn.connect()
        })

        it('emits error event if socket.send throws', (done) => {
            conn.options.socket.send = sinon.stub().throws()

            const msg = {}
            conn.on('error', (err) => {
                done()
            })
            conn.send(msg)
        })
    })
})
