import { last } from 'lodash'
import { PeerDescriptor, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'

export const getPreviousPeer = (routeMessage: RouteMessageWrapper): PeerDescriptor | undefined => {
    return last(routeMessage.routingPath!)
}
