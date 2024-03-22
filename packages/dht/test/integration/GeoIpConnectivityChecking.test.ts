import { MetricsContext } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MockTransport } from '../utils/mock/Transport'
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

jest.spyOn(WebsocketServerConnection.prototype, 'remoteIpAddress', 'get')
    .mockReturnValue(testIp)

describe('ConnectivityChecking', () => {

    let server: ConnectionManager
    const PORT = 15001
    const HOST = '127.0.0.1'

    beforeEach(async () => {
        server = new ConnectionManager({
            createConnectorFacade: () => new DefaultConnectorFacade({
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
                geoIpDatabasePath: '/tmp/tmpPath'
            }),
            metricsContext: new MetricsContext()
        })
        await server.start()
    })

    afterEach(async () => {
        await server.stop()
        fs.unlinkSync('/tmp/tmpPath/GeoLite2-City.mmdb')
        fs.rmdirSync('/tmp/tmpPath')
    })

    it('connectivityCheck replies with correct latitude and longitude', async () => {
        const request = {
            host: HOST,
            port: PORT,
            tls: false,
            selfSigned: false
        }
        const response = await sendConnectivityRequest(request, server.getLocalPeerDescriptor())
        expect(response.version).toEqual(LOCAL_PROTOCOL_VERSION)
        expect(response.latitude).toEqual(testLatitude)
        expect(response.longitude).toEqual(testLongitude)
    })
})
