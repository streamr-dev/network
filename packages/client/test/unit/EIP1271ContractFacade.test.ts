import 'reflect-metadata'
import { EIP1271ContractFacade } from '../../src/contracts/EIP1271ContractFacade'
import { mock, MockProxy } from 'jest-mock-extended'
import { StrictStreamrClientConfig } from '../../src'
import type { IERC1271 as ERC1271Contract } from '../../src/ethereumArtifacts/IERC1271'
import { randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress } from '@streamr/utils'
import range from 'lodash/range'

const CONTRACT_ADDRESS = randomEthereumAddress()

describe('EIP1271ContractFacade', () => {
    let contract: MockProxy<ERC1271Contract>
    let contractFacade: EIP1271ContractFacade

    beforeEach(() => {
        contract = mock<ERC1271Contract>()
        contractFacade = new EIP1271ContractFacade(
            undefined as any,
            { } as StrictStreamrClientConfig,
            async (address: EthereumAddress) => {
                if (address === CONTRACT_ADDRESS) {
                    return [contract]
                } else {
                    return [mock<ERC1271Contract>()]
                }
            }
        )
    })

    it('isValidSignature', async () => {
        const hash = new Uint8Array([1, 2, 3])
        const signature = new Uint8Array(range(65))
        contract.isValidSignature.calledWith(hash, signature).mockResolvedValue('0x1626ba7e')
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS, hash, signature)
        expect(result).toEqual(true)
    })
})
