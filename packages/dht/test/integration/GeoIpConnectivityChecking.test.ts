import { MetricsContext } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'
import { sendConnectivityRequest } from '../../src/connection/connectivityChecker'
import { LOCAL_PROTOCOL_VERSION } from '../../src/helpers/version'
import { WebsocketServerConnection } from '../../src/connection/websocket/WebsocketServerConnection'
import fs from 'fs'

// www.gov.za
const testIp = '164.151.129.20'

// Pretoria, South Africa
const testLatitude = -25.7599
const testLongitude = 28.2604

const dbPath = '/tmp/geoipdatabasesintegration'

describe('ConnectivityChecking', () => {
    let server: ConnectionManager
    const PORT = 15002
    const HOST = '127.0.0.1'
    let mock: jest.SpyInstance<string, [], any>

    beforeEach(async () => {
        server = new ConnectionManager({
            createConnectorFacade: () =>
                new DefaultConnectorFacade({
                    createLocalPeerDescriptor: async () => {
                        return {
                            ...createMockPeerDescriptor(),
                            websocket: {
                                host: HOST,
                                port: PORT,
                                tls: false
                            }
                        }
                    },
                    websocketHost: HOST,
                    websocketPortRange: { min: PORT, max: PORT },
                    websocketServerEnableTls: false,
                    transport: new MockTransport(),
                    geoIpDatabaseFolder: dbPath
                }),
            metricsContext: new MetricsContext(),
            allowIncomingPrivateConnections: false
        })
        await server.start()
        mock = jest.spyOn(WebsocketServerConnection.prototype, 'getRemoteIpAddress').mockImplementation(() => testIp)
    }, 15000)

    afterEach(async () => {
        await server.stop()
        fs.unlinkSync(dbPath + '/GeoLite2-City.mmdb')
        fs.rmSync(dbPath, { recursive: true })
        mock.mockRestore()
    })

    it('connectivityCheck replies with correct latitude and longitude', async () => {
        const request = {
            host: HOST,
            port: PORT,
            tls: false,
            allowSelfSignedCertificate: false
        }
        const response = await sendConnectivityRequest(request, server.getLocalPeerDescriptor())
        expect(response.protocolVersion).toEqual(LOCAL_PROTOCOL_VERSION)
        expect(response.latitude).toEqual(testLatitude)
        expect(response.longitude).toEqual(testLongitude)
    })
})
