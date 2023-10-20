import { MetricsContext } from '@streamr/utils'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ConnectionManager } from '../ConnectionManager'
import { Simulator } from './Simulator'
import { ManagedConnection } from '../ManagedConnection'
import { SimulatorConnector } from './SimulatorConnector'
import { SimulatorConnectorFacade } from '../ConnectorFacade'

export class SimulatorTransport extends ConnectionManager {
    constructor(ownPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        super({
            createConnectorFacade: (
                incomingConnectionCallback: (connection: ManagedConnection) => boolean
            ) => {
                return new SimulatorConnectorFacade(ownPeerDescriptor, incomingConnectionCallback, simulator)
            },
            metricsContext: new MetricsContext(),
            serviceIdPrefix: 'simulator/'
        })
    }
}
