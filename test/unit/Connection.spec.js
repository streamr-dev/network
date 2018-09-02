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
