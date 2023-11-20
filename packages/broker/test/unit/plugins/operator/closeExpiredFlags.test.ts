import { closeExpiredFlags } from '../../../../src/plugins/operator/closeExpiredFlags'
import { ContractFacade, SponsorshipResult } from '../../../../src/plugins/operator/ContractFacade'
import { mock } from 'jest-mock-extended'
import { toEthereumAddress } from '@streamr/utils'

const sponsorshipAddress = toEthereumAddress('0xb85ea99a770d3d79d03855045cad830ef028a024')
const operatorAddress = toEthereumAddress('0x9b9dA31a92fA066A193fc78aE55Ee3eafa865aC7')
const targetAddress = toEthereumAddress('0x3b9dA31a92fA066A193fc78aE55Ee3eafa865aC7')

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
            id: 'flagid',
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
        expect(contractFacadeMock.voteOnFlag).toHaveBeenCalledTimes(1)
        expect(contractFacadeMock.voteOnFlag).toHaveBeenCalledTimes(1)
        // 3rd boolean param is ignored in actual usage
        expect(contractFacadeMock.voteOnFlag).toHaveBeenCalledWith(sponsorshipAddress, targetAddress, false)
    })
})
