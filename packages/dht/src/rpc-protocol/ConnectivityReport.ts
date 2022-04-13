import { ConnectivityReportRequest } from '../proto/ConnectivityReport'
import { AbstractTransport } from '../transport/AbstractTransport'
import { v4 } from 'uuid'
import EventEmitter = require('events')
import { PeerID } from '../types'

export class ConnectivityReport extends EventEmitter {
    private readonly transport: AbstractTransport
    constructor(transport: AbstractTransport) {
        super()
        this.transport = transport
    }

    requestConnectivityReport(port: number, entrypoint: PeerID): void {
        const nonce = v4()
        const request: ConnectivityReportRequest = {
            port,
            nonce
        }
        const bytes = ConnectivityReportRequest.toBinary(request)
        this.transport.send(entrypoint, bytes)
    }

    onConnectivityReport(): void {

    }
}
