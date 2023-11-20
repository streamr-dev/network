import { closeExpiredFlags } from '../../../../src/plugins/operator/closeExpiredFlags'
import { ContractFacade, SponsorshipResult } from '../../../../src/plugins/operator/ContractFacade'
import { mock } from 'jest-mock-extended'
import { toEthereumAddress } from '@streamr/utils'

const testAddress = toEthereumAddress('0xb85ea99a770d3d79d03855045cad830ef028a024') // some random address

const contractFacadeMock = mock<ContractFacade>()
contractFacadeMock.getSponsorshipsOfOperator.mockImplementation(async () => {
    return [
        {
            sponsorshipAddress: testAddress,
            operatorCount: 2,
            streamId: '0x123',
        } as SponsorshipResult
    ]
})
contractFacadeMock.getExpiredFlags.mockImplementation(async () => {
    return [
        {
            id: testAddress,
            target: {
                id: testAddress
            },
            sponsorship: {
                id: testAddress
            },
            flaggingTimestamp: 0
        }
    ]
})

describe('closeExpiredFlags', () => {
    
    const flagLifetime = 1000

    test('closes expired flags', async () => {
        await closeExpiredFlags(flagLifetime, testAddress, contractFacadeMock)
        expect(contractFacadeMock.voteOnFlag).toHaveBeenCalledTimes(1)
    })
})
