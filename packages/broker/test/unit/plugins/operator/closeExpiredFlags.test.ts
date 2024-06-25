import { Operator, SponsorshipResult } from '@streamr/sdk'
import { randomEthereumAddress } from '@streamr/test-utils'
import { mock } from 'jest-mock-extended'
import { closeExpiredFlags } from '../../../../src/plugins/operator/closeExpiredFlags'

const sponsorshipAddress = randomEthereumAddress()
const operatorAddress = randomEthereumAddress()
const targetAddress = randomEthereumAddress()

const operatorMock = mock<Operator>()
operatorMock.getSponsorshipsOfOperator.mockImplementation(async () => {
    return [
        {
            sponsorshipAddress,
            operatorCount: 2,
            streamId: '0x123',
        } as SponsorshipResult
    ]
})
operatorMock.getExpiredFlags.mockImplementation(async () => {
    return [
        {
            id: 'flagId',
            target: {
                id: targetAddress
            },
            sponsorship: {
                id: sponsorshipAddress
            },
            flaggingTimestamp: 0
        }
    ]
})

describe('closeExpiredFlags', () => {
    
    const flagLifetime = 1000

    test('closes expired flags', async () => {
        await closeExpiredFlags(flagLifetime, operatorAddress, operatorMock)
        expect(operatorMock.closeFlag).toHaveBeenCalledTimes(1)
        // 3rd boolean param is ignored in actual usage
        expect(operatorMock.closeFlag).toHaveBeenCalledWith(sponsorshipAddress, targetAddress)
    })
})
