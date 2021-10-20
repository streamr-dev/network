import { isOffering } from '../../src/connection/WebRtcConnection'

describe('isOffering', () => {
    it('works', () => {
        const addresses = ['0x4f24754562b09ee7b5ed233790cdf998c18e0f5d', 'e7fe682151091921c227669e27bfc277fa8abb4a']
        const result1 = isOffering(addresses[0], addresses[1])
        const result2 = isOffering(addresses[1], addresses[0])
        expect(result1).not.toEqual(result2)
    })
})
