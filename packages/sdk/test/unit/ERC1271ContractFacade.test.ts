import { createTestPrivateKey, randomEthereumAddress } from '@streamr/test-utils'
import { EcdsaSecp256k1Evm, hexToBinary } from '@streamr/utils'
import { Provider } from 'ethers'
import { mock, MockProxy } from 'jest-mock-extended'
import { RpcProviderSource } from '../../src/RpcProviderSource'
import { ContractFactory } from '../../src/contracts/ContractFactory'
import { ERC1271ContractFacade, SUCCESS_MAGIC_VALUE } from '../../src/contracts/ERC1271ContractFacade'
import { ObservableContract } from '../../src/contracts/contract'
import type { IERC1271 as ERC1271Contract } from '../../src/ethereumArtifacts/IERC1271'

const PAYLOAD = new Uint8Array([1, 2, 3])
const CONTRACT_ADDRESS_ONE = randomEthereumAddress()
const CONTRACT_ADDRESS_TWO = randomEthereumAddress()

const signingUtil = new EcdsaSecp256k1Evm()

describe('ERC1271ContractFacade', () => {

    let contractOne: MockProxy<ERC1271Contract>
    let contractTwo: MockProxy<ERC1271Contract>
    let contractFacade: ERC1271ContractFacade
    let signature: Uint8Array

    beforeAll(async () => {
        signature = await signingUtil.createSignature(PAYLOAD, hexToBinary(await createTestPrivateKey()))
    })

    beforeEach(() => {
        contractOne = mock<ERC1271Contract>()
        contractTwo = mock<ERC1271Contract>()
        const rpcProviderSource = mock<RpcProviderSource>()
        rpcProviderSource.getProvider.mockReturnValue(mock<Provider>())
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
        contractFacade = new ERC1271ContractFacade(contractFactory, rpcProviderSource)
    })

    it('isValidSignature delegates to isValidSignature', async () => {
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        expect(contractOne.isValidSignature).toHaveBeenCalledWith(signingUtil.keccakHash(PAYLOAD), signature)
    })

    it('isValidSignature: valid case', async () => {
        contractOne.isValidSignature.mockResolvedValue(SUCCESS_MAGIC_VALUE)
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        expect(result).toEqual(true)
    })

    it('isValidSignature: invalid case', async () => {
        contractOne.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        const result = await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        expect(result).toEqual(false)
    })

    it('isValidSignature: caches the valid result', async () => {
        contractOne.isValidSignature.mockResolvedValue(SUCCESS_MAGIC_VALUE)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        expect(contractOne.isValidSignature).toHaveBeenCalledTimes(1)
    })

    it('isValidSignature: caches the invalid result', async () => {
        contractOne.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        expect(contractOne.isValidSignature).toHaveBeenCalledTimes(1)
    })

    it('differentiates between different contracts based on contract address', async () => {
        contractOne.isValidSignature.mockResolvedValue(SUCCESS_MAGIC_VALUE)
        contractTwo.isValidSignature.mockResolvedValue('0xaaaaaaaa')
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_ONE, PAYLOAD, signature)
        await contractFacade.isValidSignature(CONTRACT_ADDRESS_TWO, PAYLOAD, signature)
        expect(contractOne.isValidSignature).toHaveBeenCalledTimes(1)
        expect(contractTwo.isValidSignature).toHaveBeenCalledTimes(1)
    })
})
