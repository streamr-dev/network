import { PeerDescriptor } from "../../proto/DhtRpc"
import { ConnectionManager } from "../ConnectionManager"
import { Simulator } from "./Simulator"
import { TransportType } from '../../transport/ITransport'

export class SimulatorTransport extends ConnectionManager {
    constructor(ownPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        super({ ownPeerDescriptor: ownPeerDescriptor, simulator, serviceIdPrefix: 'simulator/' })
    }

    // eslint-disable-next-line class-methods-use-this
    getTransportType(): TransportType {
        return TransportType.SIMULATOR
    }
}
