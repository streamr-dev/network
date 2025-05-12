import { Methods } from '@streamr/test-utils'
import { Handshaker } from '../../../src/content-delivery-layer/neighbor-discovery/Handshaker'
import { DhtAddress } from '@streamr/dht'

export class MockHandshaker implements Methods<Handshaker> {

    // eslint-disable-next-line class-methods-use-this
    getOngoingHandshakes(): Set<DhtAddress> {
        return new Set()
    }

    // eslint-disable-next-line class-methods-use-this
    async attemptHandshakesOnContacts(excludedIds: DhtAddress[]): Promise<DhtAddress[]> {
        return excludedIds
    }

}
