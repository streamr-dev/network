import { ConnectivityReportRequest } from '../proto/ClosestPeers'

export class ConnectivityReport extends EventEmitter {
    constructor() {
        super()
    }

    getConnectivityReport(port, entrypoint: string) {
        this.transportManager.send()
    }
}
