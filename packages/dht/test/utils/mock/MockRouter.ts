import { Methods } from '@streamr/test-utils'
import { Router } from '../../../src/dht/routing/Router'
import { RouteMessageAck } from '../../../generated/packages/dht/protos/DhtRpc'

export class MockRouter implements Methods<Router> {
    // eslint-disable-next-line class-methods-use-this
    addRoutingSession(): void {}

    // eslint-disable-next-line class-methods-use-this
    removeRoutingSession(): void {}

    // eslint-disable-next-line class-methods-use-this
    addToDuplicateDetector(): void {}

    // eslint-disable-next-line class-methods-use-this
    isMostLikelyDuplicate(): boolean {
        return false
    }

    // eslint-disable-next-line class-methods-use-this
    doRouteMessage(): RouteMessageAck {
        return RouteMessageAck.create()
    }

    // eslint-disable-next-line class-methods-use-this
    send(): Promise<void> {
        throw new Error('Not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {}

    // eslint-disable-next-line class-methods-use-this
    async routeMessage(): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

    // eslint-disable-next-line class-methods-use-this
    async forwardMessage(): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

    // eslint-disable-next-line class-methods-use-this
    onNodeConnected(): void {}

    // eslint-disable-next-line class-methods-use-this
    onNodeDisconnected(): void {}

    // eslint-disable-next-line class-methods-use-this
    resetCache(): void {}

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }
}
