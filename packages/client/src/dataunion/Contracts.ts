import { isAddress } from '@ethersproject/address'
import { arrayify, BytesLike } from '@ethersproject/bytes'
import { Contract, ContractReceipt } from '@ethersproject/contracts'
import { verifyMessage, Wallet } from '@ethersproject/wallet'
import { Debug } from '../utils/log'
import { binanceAdapterABI, dataUnionMainnetABI, dataUnionSidechainABI, factoryMainnetABI, mainnetAmbABI, sidechainAmbABI } from './abi'
import { BigNumber } from '@ethersproject/bignumber'
import StreamrEthereum from '../Ethereum'
import DataUnionAPI from './index'
import { EthereumAddress } from 'streamr-client-protocol'
import { AmbMessageHash } from './DataUnion'

const log = Debug('Contracts')

function validateAddress(name: string, address: EthereumAddress) {
    if (!isAddress(address)) {
        throw new Error(`${name} is ${address ? 'not a valid Ethereum address' : 'missing'}`)
    }
}

export default class Contracts {
    ethereum: StreamrEthereum
    factoryMainnetAddress: EthereumAddress
    factorySidechainAddress: EthereumAddress
    templateMainnetAddress: EthereumAddress
    templateSidechainAddress: EthereumAddress
    binanceAdapterAddress: EthereumAddress
    binanceSmartChainAMBAddress: EthereumAddress
    cachedSidechainAmb?: Contract | Promise<Contract>

    constructor(client: DataUnionAPI) {
        this.ethereum = client.ethereum
        this.factoryMainnetAddress = client.options.dataUnion.factoryMainnetAddress
        this.factorySidechainAddress = client.options.dataUnion.factorySidechainAddress
        this.templateMainnetAddress = client.options.dataUnion.templateMainnetAddress
        this.templateSidechainAddress = client.options.dataUnion.templateSidechainAddress
        this.binanceAdapterAddress = client.options.binanceAdapterAddress
        this.binanceSmartChainAMBAddress = client.options.binanceSmartChainAMBAddress
    }

    /**
     * Check if there is a data union in given address, return its version
     * @returns 0 if target address is not a Data Union contract
     */
    async getVersion(contractAddress: EthereumAddress): Promise<number> {
        validateAddress('contractAddress', contractAddress)
        const provider = this.ethereum.getMainnetProviders()[0]
        const du = new Contract(contractAddress, [{
            name: 'version',
            inputs: [],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
        }], provider)
        try {
            const version = await du.version() as BigNumber
            return version.toNumber()
        } catch (e) {
            // "not a data union"
            return 0
        }
    }

    async getMainnetContractReadOnly(contractAddress: EthereumAddress) {
        const version = await this.getVersion(contractAddress)
        if (version === 0) {
            throw new Error(`${contractAddress} is not a Data Union contract`)
        }
        const provider = this.ethereum.getMainnetProviders()[0]
        return new Contract(contractAddress, dataUnionMainnetABI, provider)
    }

    async getMainnetContract(contractAddress: EthereumAddress) {
        const du = await this.getMainnetContractReadOnly(contractAddress)
        const signer = this.ethereum.getSigner()
        return du.connect(signer)
    }

    async getSidechainContract(contractAddress: EthereumAddress) {
        const signer = await this.ethereum.getDataUnionChainSigner()
        const duMainnet = await this.getMainnetContractReadOnly(contractAddress)
        const duSidechainAddress = await duMainnet.sidechainAddress()
        const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, signer)
        return duSidechain
    }

    async getSidechainContractReadOnly(contractAddress: EthereumAddress) {
        const provider = this.ethereum.getDataUnionChainProviders()[0]
        const duMainnet = await this.getMainnetContractReadOnly(contractAddress)
        const duSidechainAddress = await duMainnet.sidechainAddress()
        const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, provider)
        return duSidechain
    }

    // Find the Asyncronous Message-passing Bridge sidechain ("home") contract
    async getSidechainAmb(): Promise<Contract> {
        if (!this.cachedSidechainAmb) {
            const getAmbPromise = async () => {
                const sidechainProvider = this.ethereum.getDataUnionChainProviders()[0]
                const factorySidechain = new Contract(this.factorySidechainAddress, [{
                    name: 'amb',
                    inputs: [],
                    outputs: [{ type: 'address' }],
                    stateMutability: 'view',
                    type: 'function'
                }], sidechainProvider)
                const sidechainAmbAddress = await factorySidechain.amb()
                return new Contract(sidechainAmbAddress, sidechainAmbABI, sidechainProvider)
            }
            this.cachedSidechainAmb = getAmbPromise()
            this.cachedSidechainAmb = await this.cachedSidechainAmb // eslint-disable-line require-atomic-updates
        }
        return this.cachedSidechainAmb
    }

    async getMainnetAmb() {
        const mainnetProvider = this.ethereum.getMainnetProviders()[0]
        const factoryMainnet = new Contract(this.factoryMainnetAddress, factoryMainnetABI, mainnetProvider)
        const mainnetAmbAddress = await factoryMainnet.amb()
        return new Contract(mainnetAmbAddress, mainnetAmbABI, mainnetProvider)
    }

    async getBinanceAdapter() {
        return new Contract(this.binanceAdapterAddress, binanceAdapterABI, await this.ethereum.getDataUnionChainSigner())
    }

    getBinanceAdapterReadOnly() {
        return new Contract(this.binanceAdapterAddress, binanceAdapterABI, this.ethereum.getDataUnionChainProviders()[0])
    }

    async getBinanceSmartChainAmb(binanceSenderPrivateKey: BytesLike) {
        const signer = new Wallet(binanceSenderPrivateKey, this.ethereum.getBinanceProviders()[0])
        return new Contract(this.binanceSmartChainAMBAddress, mainnetAmbABI, signer)
    }

    async requiredSignaturesHaveBeenCollected(messageHash: AmbMessageHash) {
        const sidechainAmb = await this.getSidechainAmb()
        const requiredSignatureCount = await sidechainAmb.requiredSignatures()

        // Bit 255 is set to mark completion, double check though
        const sigCountStruct = await sidechainAmb.numMessagesSigned(messageHash)
        const collectedSignatureCount = sigCountStruct.mask(255)
        const markedComplete = sigCountStruct.shr(255).gt(0)

        log(`${collectedSignatureCount.toString()} out of ${requiredSignatureCount.toString()} collected`)
        if (markedComplete) { log('All signatures collected') }
        return markedComplete
    }

    /**
     * Move signatures from sidechain to mainnet
     * @returns null if message was already transported, ELSE the mainnet AMB signature execution transaction receipt
     */
    async transportSignaturesForMessage(messageHash: string, ethersOptions = {}): Promise<ContractReceipt | null> {
        const sidechainAmb = await this.getSidechainAmb()
        const message = await sidechainAmb.message(messageHash)
        const messageId = '0x' + message.substr(2, 64)
        const sigCountStruct = await sidechainAmb.numMessagesSigned(messageHash)
        const collectedSignatureCount = sigCountStruct.mask(255).toNumber()

        log(`${collectedSignatureCount} signatures reported, getting them from the sidechain AMB...`)
        const signatures = await Promise.all(Array(collectedSignatureCount).fill(0).map(async (_, i) => sidechainAmb.signature(messageHash, i)))

        const [vArray, rArray, sArray]: [string[], string[], string[]] = [[], [], []]
        signatures.forEach((signature: string, i) => {
            log(`  Signature ${i}: ${signature} (len=${signature.length} = ${signature.length / 2 - 1} bytes)`)
            rArray.push(signature.substr(2, 64))
            sArray.push(signature.substr(66, 64))
            vArray.push(signature.substr(130, 2))
        })
        const packedSignatures = BigNumber.from(signatures.length).toHexString() + vArray.join('') + rArray.join('') + sArray.join('')
        log(`All signatures packed into one: ${packedSignatures}`)

        // Gas estimation also checks that the transaction would succeed, and provides a helpful error message in case it would fail
        const mainnetAmb = await this.getMainnetAmb()
        log(`Estimating gas using mainnet AMB @ ${mainnetAmb.address}, message=${message}`)
        let gasLimit
        try {
            // magic number suggested by https://github.com/poanetwork/tokenbridge/blob/master/oracle/src/utils/constants.js
            gasLimit = BigNumber.from(await mainnetAmb.estimateGas.executeSignatures(message, packedSignatures)).add(200000)
            log(`Calculated gas limit: ${gasLimit.toString()}`)
        } catch (e) {
            // Failure modes from https://github.com/poanetwork/tokenbridge/blob/master/oracle/src/events/processAMBCollectedSignatures/estimateGas.js
            log('Gas estimation failed: Check if the message was already processed')
            const alreadyProcessed = await mainnetAmb.relayedMessages(messageId)
            if (alreadyProcessed) {
                log(`WARNING: Tried to transport signatures but they have already been transported (Message ${messageId} has already been processed)`)
                log('This could happen if bridge paid for transport before your client.')
                return null
            }

            log('Gas estimation failed: Check if number of signatures is enough')
            const mainnetProvider = this.ethereum.getMainnetProviders()[0]
            const validatorContractAddress = await mainnetAmb.validatorContract()
            const validatorContract = new Contract(validatorContractAddress, [{
                name: 'isValidator',
                inputs: [{ type: 'address' }],
                outputs: [{ type: 'bool' }],
                stateMutability: 'view',
                type: 'function'
            }, {
                name: 'requiredSignatures',
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view',
                type: 'function'
            }], mainnetProvider)
            const requiredSignatures = await validatorContract.requiredSignatures()
            if (requiredSignatures.gt(signatures.length)) {
                throw new Error('The number of required signatures does not match between sidechain('
                    + signatures.length + ' and mainnet( ' + requiredSignatures.toString())
            }

            log('Gas estimation failed: Check if all the signatures were made by validators')
            log(`  Recover signer addresses from signatures [${signatures.join(', ')}]`)
            const signers = signatures.map((signature) => verifyMessage(arrayify(message), signature))
            log(`  Check that signers are validators [[${signers.join(', ')}]]`)
            const isValidatorArray = await Promise.all(signers.map((address) => [address, validatorContract.isValidator(address)]))
            const nonValidatorSigners = isValidatorArray.filter(([, isValidator]) => !isValidator)
            if (nonValidatorSigners.length > 0) {
                throw new Error(`Following signers are not listed as validators in mainnet validator contract at ${validatorContractAddress}:\n - `
                    + nonValidatorSigners.map(([address]) => address).join('\n - '))
            }

            throw new Error(`Gas estimation failed: Unknown error while processing message ${message} with ${e.stack}`)
        }

        const signer = this.ethereum.getSigner()
        log(`Sending message from signer=${await signer.getAddress()}`)
        const txAMB = await mainnetAmb.connect(signer).executeSignatures(message, packedSignatures, ethersOptions)
        const trAMB = await txAMB.wait()
        return trAMB
    }
}
