import { MetricsContext } from '@streamr/utils'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ConnectionManager } from '../ConnectionManager'
import { Simulator } from './Simulator'
import { SimulatorConnectorFacade } from '../ConnectorFacade'

export class SimulatorTransport extends ConnectionManager {
    constructor(ownPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        super({
            createConnectorFacade: () => new SimulatorConnectorFacade(ownPeerDescriptor, simulator),
            metricsContext: new MetricsContext()
        })
    }
}
