import { ServiceID } from '@streamr/dht'
import { StreamPartID } from '@streamr/protocol'

export const formStreamPartContentDeliveryServiceId = (streamPartId: StreamPartID): ServiceID => {
    // could be "content-delivery" instead of "delivery", but that is a breaking change
    return `stream-part-delivery-${streamPartId}`
}
