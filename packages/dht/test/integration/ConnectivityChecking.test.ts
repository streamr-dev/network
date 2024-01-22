import { MetricsContext } from "@streamr/utils"
import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { DefaultConnectorFacade } from "../../src/connection/ConnectorFacade"
import { MockTransport } from "../utils/mock/Transport"
import { createMockPeerDescriptor } from "../utils/utils"
import { connectAsync, sendConnectivityRequest } from "../../src/connection/connectivityChecker"
import { version } from '../../package.json'

describe('ConnectivityChecking', () => {

    let server: ConnectionManager

    beforeEach(async () => {
        server = new ConnectionManager({
            createConnectorFacade: () => new DefaultConnectorFacade({
                createLocalPeerDescriptor: () => {
                    return {
                        ...createMockPeerDescriptor(),
                        websocket: {
                            host: '127.0.0.1',
                            port: 15000,
                            tls: false
                        }
                    }
                },
                websocketServerEnableTls: false,
                websocketPortRange: { min: 15000, max: 15000 },
                websocketHost: '127.0.0.1',
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
            host: '127.0.0.1',
            port: 15000,
            tls: false,
            selfSigned: false
        }
        const response = await sendConnectivityRequest(request, server.getLocalPeerDescriptor(), undefined as any)
        expect(response.version).toEqual(version)
    })

    it('connectivityCheck with non-compatible version', async () => {
        const request = {
            host: '127.0.0.1',
            port: 15000,
            tls: false,
            selfSigned: false
        }
        await expect(sendConnectivityRequest(request, server.getLocalPeerDescriptor(), '0.0.1'))
            .toReject()
    })

})
