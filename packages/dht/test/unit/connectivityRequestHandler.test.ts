import { ipv4ToNumber, until } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { once } from 'events'
import { Server as HttpServer, createServer as createHttpServer } from 'http'
import { server as WsServer } from 'websocket'
import { CONNECTIVITY_CHECKER_SERVICE_ID } from '../../src/connection/connectivityChecker'
import { attachConnectivityRequestHandler } from '../../src/connection/connectivityRequestHandler'
import { Message } from '../../generated/packages/dht/protos/DhtRpc'
import { LOCAL_PROTOCOL_VERSION } from '../../src/helpers/version'

const HOST = '127.0.0.1'
const PORT = 15001

describe('connectivityRequestHandler', () => {
    let httpServer: HttpServer
    let wsServer: WsServer
    let connection: any

    beforeEach(async () => {
        httpServer = createHttpServer()
        wsServer = new WsServer({
            httpServer,
            autoAcceptConnections: true
        })
        httpServer.listen(PORT)
        await once(httpServer, 'listening')
        connection = new EventEmitter()
        connection.send = jest.fn()
        connection.getRemoteIpAddress = () => HOST
    })

    afterEach(async () => {
        wsServer.shutDown()
        httpServer.close()
        await once(httpServer, 'close')
    })

    it('happy path', async () => {
        attachConnectivityRequestHandler(connection)
        const request: Message = {
            serviceId: CONNECTIVITY_CHECKER_SERVICE_ID,
            messageId: 'mock-message-id',
            body: {
                oneofKind: 'connectivityRequest',
                connectivityRequest: { port: PORT, host: HOST, tls: false, allowSelfSignedCertificate: false }
            }
        }
        connection.emit('data', Message.toBinary(request))

        await until(() => connection.send.mock.calls.length > 0)

        const receivedMessage = Message.fromBinary(connection.send.mock.calls[0][0])
        expect(receivedMessage).toEqual({
            body: {
                connectivityResponse: {
                    host: HOST,
                    natType: 'open_internet',
                    websocket: {
                        host: HOST,
                        port: PORT,
                        tls: false
                    },
                    ipAddress: ipv4ToNumber(HOST),
                    protocolVersion: LOCAL_PROTOCOL_VERSION
                },
                oneofKind: 'connectivityResponse'
            },
            messageId: expect.any(String),
            serviceId: 'system/connectivity-checker'
        })
    })

    it('disabled connectivity probing', async () => {
        attachConnectivityRequestHandler(connection)
        const request: Message = {
            serviceId: CONNECTIVITY_CHECKER_SERVICE_ID,
            messageId: 'mock-message-id',
            body: {
                oneofKind: 'connectivityRequest',
                connectivityRequest: { port: 0, host: HOST, tls: false, allowSelfSignedCertificate: false }
            }
        }
        connection.emit('data', Message.toBinary(request))

        await until(() => connection.send.mock.calls.length > 0)

        const receivedMessage = Message.fromBinary(connection.send.mock.calls[0][0])
        expect(receivedMessage).toEqual({
            body: {
                connectivityResponse: {
                    host: HOST,
                    natType: 'unknown',
                    ipAddress: ipv4ToNumber(HOST),
                    protocolVersion: LOCAL_PROTOCOL_VERSION
                },
                oneofKind: 'connectivityResponse'
            },
            messageId: expect.any(String),
            serviceId: 'system/connectivity-checker'
        })
    })
})
