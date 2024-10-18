import { last } from 'lodash'
import { RouteMessageWrapper } from '../../../generated/packages/dht/protos/DhtRpc'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/PeerDescriptor'

export const getPreviousPeer = (routeMessage: RouteMessageWrapper): PeerDescriptor | undefined => {
    return last(routeMessage.routingPath)
}
