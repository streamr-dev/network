import { MetricsContext } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'
import { sendConnectivityRequest } from '../../src/connection/connectivityChecker'
import { LOCAL_PROTOCOL_VERSION } from '../../src/helpers/version'

describe('ConnectivityChecking', () => {
    let server: ConnectionManager
    const PORT = 15000
    const HOST = '127.0.0.1'

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
                    transport: new MockTransport()
                }),
            metricsContext: new MetricsContext(),
            allowIncomingPrivateConnections: false
        })
        await server.start()
    })

    afterEach(async () => {
        await server.stop()
    })

    it('connectivityCheck with compatible version', async () => {
        const request = {
            host: HOST,
            port: PORT,
            tls: false,
            allowSelfSignedCertificate: false
        }
        const response = await sendConnectivityRequest(request, server.getLocalPeerDescriptor())
        expect(response.protocolVersion).toEqual(LOCAL_PROTOCOL_VERSION)
    })
})
