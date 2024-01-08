import { closeExpiredFlags } from '../../../../src/plugins/operator/closeExpiredFlags'
import { ContractFacade, SponsorshipResult } from '../../../../src/plugins/operator/ContractFacade'
import { mock } from 'jest-mock-extended'
import { randomEthereumAddress } from '@streamr/test-utils'

const sponsorshipAddress = randomEthereumAddress()
const operatorAddress = randomEthereumAddress()
const targetAddress = randomEthereumAddress()

const contractFacadeMock = mock<ContractFacade>()
contractFacadeMock.getSponsorshipsOfOperator.mockImplementation(async () => {
    return [
        {
            sponsorshipAddress,
            operatorCount: 2,
            streamId: '0x123',
        } as SponsorshipResult
    ]
})
contractFacadeMock.getExpiredFlags.mockImplementation(async () => {
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
        await closeExpiredFlags(flagLifetime, operatorAddress, contractFacadeMock)
        expect(contractFacadeMock.closeFlag).toHaveBeenCalledTimes(1)
        // 3rd boolean param is ignored in actual usage
        expect(contractFacadeMock.closeFlag).toHaveBeenCalledWith(sponsorshipAddress, targetAddress)
    })
})
