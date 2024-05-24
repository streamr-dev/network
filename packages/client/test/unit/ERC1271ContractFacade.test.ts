import 'reflect-metadata'
import { ERC1271ContractFacade, SUCCESS_MAGIC_VALUE } from '../../src/contracts/ERC1271ContractFacade'
import { mock, MockProxy } from 'jest-mock-extended'
import type { IERC1271 as ERC1271Contract } from '../../src/ethereumArtifacts/IERC1271'
import { fastPrivateKey, randomEthereumAddress } from '@streamr/test-utils'
import { createSignature, hexToBinary, hash } from '@streamr/utils'
import { RpcProviderFactory } from '../../src/RpcProviderFactory'
import { ContractFactory } from '../../src/ContractFactory'
import { Provider } from 'ethers'
import { ObservableContract } from '../../src/utils/contract'

const PRIVATE_KEY = fastPrivateKey()
const PAYLOAD = new Uint8Array([1, 2, 3])
const SIGNATURE = createSignature(PAYLOAD, hexToBinary(PRIVATE_KEY))
const CONTRACT_ADDRESS_ONE = randomEthereumAddress()
const CONTRACT_ADDRESS_TWO = randomEthereumAddress()

describe('ERC1271ContractFacade', () => {
    let contractOne: MockProxy<ERC1271Contract>
    let contractTwo: MockProxy<ERC1271Contract>
    let contractFacade: ERC1271ContractFacade

    beforeEach(() => {
        contractOne = mock<ERC1271Contract>()
        contractTwo = mock<ERC1271Contract>()
        const rpcProviderFactory = mock<RpcProviderFactory>()
        rpcProviderFactory.getProviders.mockReturnValue([mock<Provider>()])
        const contractFactory = mock<ContractFactory>()
        contractFactory.createReadContract.mockImplementation((address) => {
            switch (address) {
                case CONTRACT_ADDRESS_ONE:
                    return contractOne as ObservableContract<any>
                case CONTRACT_ADDRESS_TWO:
                    return contractTwo as ObservableContract<any>
                default:
                    throw new Error('test: should not be here')
            }
        })
        contractFacade = new ERC1271ContractFacade(contractFactory, rpcProviderFactory)
    })

    it('isValidSignature delegates to isValidSignature', async () => {
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        expect(contractOne.isValidSignature).toHaveBeenCalledWith(hash(PAYLOAD), SIGNATURE)
    })

    it('isValidSignature: valid case', async () => {
        contractOne.isValidSignature.mockResolvedValue(SUCCESS_MAGIC_VALUE)
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        expect(result).toEqual(true)
    })

    it('isValidSignature: invalid case', async () => {
        contractOne.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        expect(result).toEqual(false)
    })

    it('isValidSignature: caches the valid result', async () => {
        contractOne.isValidSignature.mockResolvedValue(SUCCESS_MAGIC_VALUE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        expect(contractOne.isValidSignature).toHaveBeenCalledTimes(1)
    })

    it('isValidSignature: caches the invalid result', async () => {
        contractOne.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        expect(contractOne.isValidSignature).toHaveBeenCalledTimes(1)
    })

    it('differentiates between different contracts based on contract address', async () => {
        contractOne.isValidSignature.mockResolvedValue(SUCCESS_MAGIC_VALUE)
        contractTwo.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, SIGNATURE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_TWO, PAYLOAD, SIGNATURE)
        expect(contractOne.isValidSignature).toHaveBeenCalledTimes(1)
        expect(contractTwo.isValidSignature).toHaveBeenCalledTimes(1)
    })
})
