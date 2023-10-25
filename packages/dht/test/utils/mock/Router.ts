import { IRouter } from '../../../src/dht/routing/Router'
import { PeerDescriptor, Message, RouteMessageAck } from '../../../src/proto/packages/dht/protos/DhtRpc'

export class MockRouter implements IRouter {

    // eslint-disable-next-line class-methods-use-this
    addRoutingSession(): void {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    removeRoutingSession(): void {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    addToDuplicateDetector(): void {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    isMostLikelyDuplicate(): boolean {
        return false
    }

    // eslint-disable-next-line class-methods-use-this
    doRouteMessage(): RouteMessageAck {
        return RouteMessageAck.create()
    }

    // eslint-disable-next-line class-methods-use-this
    send(_msg: Message, _reachableThrough: PeerDescriptor[]): Promise<void> {
        throw Error('Not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }

    // eslint-disable-next-line class-methods-use-this
    async routeMessage(): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

    // eslint-disable-next-line class-methods-use-this
    async forwardMessage(): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

}
