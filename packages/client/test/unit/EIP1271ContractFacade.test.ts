import 'reflect-metadata'
import { EIP1271ContractFacade } from '../../src/contracts/EIP1271ContractFacade'
import { mock, MockProxy } from 'jest-mock-extended'
import { StrictStreamrClientConfig } from '../../src'
import type { IERC1271 as ERC1271Contract } from '../../src/ethereumArtifacts/IERC1271'
import { fastPrivateKey, randomEthereumAddress } from '@streamr/test-utils'
import { createSignature, EthereumAddress, hexToBinary } from '@streamr/utils'

const PRIVATE_KEY = fastPrivateKey()
const PAYLOAD_HASH = new Uint8Array([1, 2, 3])
const SIGNATURE = createSignature(PAYLOAD_HASH, hexToBinary(PRIVATE_KEY))

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
                    return []
                }
            }
        )
    })

    it('isValidSignature delegates to isValidSignature', async () => {
        await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        expect(contract.isValidSignature).toHaveBeenCalledWith(PAYLOAD_HASH, SIGNATURE)
    })

    it('isValidSignature: valid case', async () => {
        contract.isValidSignature.mockResolvedValue('0x1626ba7e')
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        expect(result).toEqual(true)
    })

    it('isValidSignature: invalid case', async () => {
        contract.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        expect(result).toEqual(false)
    })

    it('isValidSignature: caches the valid result', async () => {
        contract.isValidSignature.mockResolvedValue('0x1626ba7e')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        expect(contract.isValidSignature).toHaveBeenCalledTimes(1)
    })

    it('isValidSignature: caches the invalid result', async () => {
        contract.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        expect(contract.isValidSignature).toHaveBeenCalledTimes(1)
    })

    it('differentiates between different contracts based on contract address', async () => {
        const contract2 = mock<ERC1271Contract>()
        contractFacade = new EIP1271ContractFacade(
            undefined as any,
            { } as StrictStreamrClientConfig,
            async (address: EthereumAddress) => {
                if (address === CONTRACT_ADDRESS) {
                    return [contract]
                } else {
                    return [contract2]
                }
            }
        )
        contract.isValidSignature.mockResolvedValue('0x1626ba7e')
        contract2.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS, PAYLOAD_HASH, SIGNATURE)
        await contractFacade.isValidSignature(randomEthereumAddress(), PAYLOAD_HASH, SIGNATURE)
        expect(contract.isValidSignature).toHaveBeenCalledTimes(1)
        expect(contract2.isValidSignature).toHaveBeenCalledTimes(1)
    })
})
