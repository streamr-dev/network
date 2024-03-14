import { ServiceID } from '@streamr/dht'
import { StreamPartID } from '@streamr/protocol'

export const formStreamPartContentDeliveryServiceId = (streamPartId: StreamPartID): ServiceID => {
    return `stream-part-delivery-${streamPartId}`
}
