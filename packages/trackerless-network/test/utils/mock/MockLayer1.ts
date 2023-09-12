import { PeerDescriptor } from '@streamr/dht'

export const mockLayer1 = {
    on: (): void => {},
    once: (): void => {},
    off: (): void => {},
    getNeighborList: (): any => { return { getClosestContacts: () => [] }},
    getKBucketPeers: (): PeerDescriptor[] => [],
}
