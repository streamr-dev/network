import { MetricsContext } from '@streamr/utils'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/PeerDescriptor'
import { ConnectionManager } from '../ConnectionManager'
import { Simulator } from './Simulator'
import { SimulatorConnectorFacade } from '../ConnectorFacade'

export class SimulatorTransport extends ConnectionManager {
    constructor(localPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        super({
            createConnectorFacade: () => new SimulatorConnectorFacade(localPeerDescriptor, simulator),
            metricsContext: new MetricsContext(),
            allowIncomingPrivateConnections: false
        })
    }
}
