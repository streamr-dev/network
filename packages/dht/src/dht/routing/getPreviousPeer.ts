import last from 'lodash/last'
import { PeerDescriptor, RouteMessageWrapper } from '../../../generated/packages/dht/protos/DhtRpc'

export const getPreviousPeer = (routeMessage: RouteMessageWrapper): PeerDescriptor | undefined => {
    return last(routeMessage.routingPath)
}
