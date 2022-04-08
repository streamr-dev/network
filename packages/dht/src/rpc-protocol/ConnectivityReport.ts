import { ConnectivityReportRequest } from '../proto/ConnectivityReport'
import { ITransport } from '../transport/ITransport'
import { v4 } from 'uuid'
import EventEmitter = require('events')
import { PeerID } from '../types'

export class ConnectivityReport extends EventEmitter {
    private readonly transport: ITransport
    constructor(transport: ITransport) {
        super()
        this.transport = transport
    }

    requestConnectivityReport(port: number, entrypoint: PeerID) {
        const nonce = v4()
        const request: ConnectivityReportRequest = {
            port,
            nonce
        }
        const bytes = ConnectivityReportRequest.toBinary(request)
        this.transport.send(entrypoint, bytes)
    }

    onConnectivityReport() {

    }
}
