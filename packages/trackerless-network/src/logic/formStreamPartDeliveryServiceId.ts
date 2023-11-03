import { StreamPartID } from '@streamr/protocol'

export const formStreamPartDeliveryServiceId = (streamPartId: StreamPartID): string => {
    return `stream-part-delivery-${streamPartId}`
}
