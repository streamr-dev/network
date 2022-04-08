import EventEmitter = require('events')
import { ClosestPeersRequest, ClosestPeersResponse} from '../proto/ClosestPeers'

export class ClosestPeers extends EventEmitter {
    constructor() {
        super()
    }

    requestClosestPeers(request: ClosestPeersRequest, neighborId: string) {
        this.transportManager.send()
    }
}
