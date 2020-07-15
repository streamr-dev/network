import { ControlLayer, MessageLayer } from 'streamr-client-protocol'

import Connection from '../../src/Connection'

const { UnicastMessage, ControlMessage } = ControlLayer
const { StreamMessage, MessageIDStrict, MessageRef } = MessageLayer

describe('Connection', () => {
    let conn
    beforeEach(() => {
        conn = new Connection({
            url: 'foo',
        }, {
            on: jest.fn(),
            close: jest.fn(),
        })
    })

    describe('initial state', () => {
        it('should be correct', () => {
            expect(conn.state).toEqual(Connection.State.DISCONNECTED)
        })
    })

    describe('connect()', () => {
        it('returns a promise and resolves it when connected', async () => {
            const result = conn.connect()
            expect(result instanceof Promise).toBeTruthy()
            conn.socket.onopen()
            await result
        })

        it('adds listeners to socket', () => {
            conn.connect()
            expect(conn.socket.onopen != null).toBeTruthy()
            expect(conn.socket.onclose != null).toBeTruthy()
            expect(conn.socket.onmessage != null).toBeTruthy()
            expect(conn.socket.onerror != null).toBeTruthy()
        })

        it('should report correct state when connecting', () => {
            conn.connect()
            expect(conn.state).toEqual(Connection.State.CONNECTING)
        })

        it('should report correct state flag when connected', () => {
            conn.connect()
            conn.socket.onopen()
            expect(conn.state).toEqual(Connection.State.CONNECTED)
        })

        it('should reject the promise if already connected', async () => {
            conn.connect()
            conn.socket.onopen()
            expect(conn.state).toEqual(Connection.State.CONNECTED)

            await expect(() => (
                conn.connect()
            )).rejects.toThrow()
            expect(conn.state).toEqual(Connection.State.CONNECTED)
        })

        it('should resolve the promise', async () => {
            const task = conn.connect()
            conn.socket.onopen()
            conn.socket.onopen()
            await task
        })
    })

    describe('disconnect()', () => {
        beforeEach(() => {
            conn.connect()
            conn.socket.onopen()
            expect(conn.state).toEqual(Connection.State.CONNECTED)
        })

        afterEach(() => {
            conn.disconnect().catch(() => {
                // ignore
            })
        })

        it('returns a promise and resolves it when disconnected', () => {
            const result = conn.disconnect()
            expect(result instanceof Promise).toBeTruthy()
            conn.socket.onclose()
            return result
        })

        it('should call socket.close()', () => {
            conn.disconnect()
            expect(conn.socket.close).toHaveBeenCalledTimes(1)
        })

        it('should report correct state when disconnecting', () => {
            conn.disconnect()
            expect(conn.state).toEqual(Connection.State.DISCONNECTING)
        })

        it('should report correct state flag when connected', () => {
            conn.disconnect()
            conn.socket.onclose()
            expect(conn.state).toEqual(Connection.State.DISCONNECTED)
        })

        it('should reject the promise if already disconnected', async () => {
            conn.disconnect()
            conn.socket.onclose()
            expect(conn.state).toEqual(Connection.State.DISCONNECTED)

            await expect(() => conn.disconnect()).rejects.toThrow()
            expect(conn.state).toEqual(Connection.State.DISCONNECTED)
        })

        it('should resolve the promise', async () => {
            const task = conn.disconnect()
            conn.socket.onclose()
            conn.socket.onclose()
            await task
        })
    })

    describe('send()', () => {
        beforeEach(() => {
            conn.connect()
        })

        it('sends the serialized message over the socket', () => {
            const request = {
                serialize: jest.fn(() => 'foo')
            }
            conn.socket.send = jest.fn()

            conn.send(request)
            expect(request.serialize).toHaveBeenCalledTimes(1)
            expect(conn.socket.send).toHaveBeenCalledWith('foo', expect.any(Function))
        })

        it('emits error event if socket.send throws', (done) => {
            const request = {
                serialize: jest.fn()
            }
            conn.socket.send = () => {
                throw new Error('test')
            }

            conn.once('error', (err) => {
                expect(err.message).toEqual('test')
                done()
            })
            conn.send(request).catch((err) => {
                // hm, this probably should *either* emit an error or reject
                expect(err.message).toEqual('test')
            })
        })
    })

    describe('event handling on socket', () => {
        beforeEach(() => {
            conn.connect()
            conn.socket.onopen()
        })

        describe('message', () => {
            it('emits events named by messageTypeName and the ControlMessage as an argument', (done) => {
                const timestamp = Date.now()
                const content = {
                    hello: 'world',
                }
                conn.once(ControlMessage.TYPES.UnicastMessage, (message) => {
                    expect(message instanceof UnicastMessage).toBeTruthy()
                    expect(message.streamMessage.getTimestamp()).toEqual(timestamp)
                    expect(message.streamMessage.getParsedContent().hello).toEqual('world')
                    expect(message.requestId).toEqual('requestId')
                    done()
                })

                const message = new UnicastMessage({
                    requestId: 'requestId',
                    streamMessage: new StreamMessage({
                        messageId: new MessageIDStrict('streamId', 0, timestamp, 0, '', ''),
                        prevMsgRef: new MessageRef(timestamp - 100, 0),
                        content,
                        contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                        encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                        signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    })
                })

                conn.socket.onmessage({
                    data: message.serialize(),
                })
            })

            it('does not emit an error event when a message contains invalid json', (done) => {
                const onError = jest.fn()
                conn.once('error', onError) // shouldn't error because content itself not deserialized in connection
                conn.once(ControlMessage.TYPES.UnicastMessage, () => {
                    expect(onError).not.toHaveBeenCalled()
                    done()
                })
                const timestamp = Date.now()

                const message = new UnicastMessage({
                    requestId: 'requestId',
                    streamMessage: new StreamMessage({
                        messageId: new MessageIDStrict('streamId', 0, timestamp, 0, '', ''),
                        prevMsgRef: null,
                        content: '{', // bad json
                        contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                        encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                        signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    })
                })
                const data = message.serialize()
                conn.socket.onmessage({
                    data,
                })
            })
        })

        describe('close', () => {
            beforeAll(() => {
                jest.useFakeTimers()
            })

            afterAll(() => {
                jest.useRealTimers()
            })

            it('tries to reconnect after 2 seconds', () => {
                conn.connect = jest.fn(async () => {})
                conn.socket.events.emit('close')
                jest.advanceTimersByTime(2100)
                expect(conn.connect).toHaveBeenCalledTimes(1)
            })
        })
    })
})
