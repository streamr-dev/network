import { IRouter } from "../../../src/dht/routing/Router"
import { RoutingSession, RoutingMode } from "../../../src/dht/routing/RoutingSession"
import { PeerDescriptor, Message, RouteMessageAck, RouteMessageWrapper } from '../../../src/proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export class MockRouter implements IRouter {

    // eslint-disable-next-line class-methods-use-this
    addRoutingSession(_session: RoutingSession): void {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    removeRoutingSession(_sessionId: string): void {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    addToDuplicateDetector(_messageId: string, _senderId: string, _message?: Message): void {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    checkDuplicate(_messageId: string): boolean {
        return false
    }

    // eslint-disable-next-line class-methods-use-this
    doRouteMessage(_routedMessage: RouteMessageWrapper, _mode: RoutingMode): RouteMessageAck {
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
    async routeMessage(_routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

    // eslint-disable-next-line class-methods-use-this
    async forwardMessage(_forwardMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

}
