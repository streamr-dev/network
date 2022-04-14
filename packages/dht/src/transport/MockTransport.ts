import { AbstractTransport } from './AbstractTransport'
import { PeerID } from '../types'
import { RpcWrapper } from '../proto/DhtRpc'

type MockSendFunction = (message: Uint8Array) => any
export class MockTransport extends AbstractTransport {
    private function: MockSendFunction
    private requests: Map<string, NodeJS.Timeout>

    constructor() {
        super()
        this.function = () => {}
        this.requests = new Map()
    }

    send(peerId: PeerID, message: Uint8Array): boolean {
        if (!this.function) {
            return false
        }
        this.function(message)
        return true
    }

    async request(peerId: PeerID, message: Uint8Array, requestId: string): Promise<RpcWrapper> {
        this.requests.set(requestId, setTimeout(() => this.timeoutFn()))
        this.send(peerId, message)
        return this.waitForResponse(requestId)
    }

    setFunction(f: MockSendFunction): void {
        this.function = f
    }

    timeoutFn(): void {
        console.log("aaaaaaa")
    }
}