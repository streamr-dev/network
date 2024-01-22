import { MetricsContext } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor } from '../utils/utils'
import { sendConnectivityRequest } from '../../src/connection/connectivityChecker'
import { version } from '../../package.json'

describe('ConnectivityChecking', () => {

    let server: ConnectionManager
    const PORT = 15000
    const HOST = '127.0.0.1'

    beforeEach(async () => {
        server = new ConnectionManager({
            createConnectorFacade: () => new DefaultConnectorFacade({
                createLocalPeerDescriptor: () => {
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
            metricsContext: new MetricsContext()
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
            selfSigned: false
        }
        const response = await sendConnectivityRequest(request, server.getLocalPeerDescriptor(), version)
        expect(response.version).toEqual(version)
    })

    it('connectivityCheck with incompatible version', async () => {
        const request = {
            host: HOST,
            port: PORT,
            tls: false,
            selfSigned: false
        }
        await expect(sendConnectivityRequest(request, server.getLocalPeerDescriptor(), '0.0.1'))
            .toReject()
    })

})
