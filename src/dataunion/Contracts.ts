import { getCreate2Address, isAddress } from '@ethersproject/address'
import { arrayify, hexZeroPad } from '@ethersproject/bytes'
import { Contract } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'
import { defaultAbiCoder } from '@ethersproject/abi'
import { verifyMessage } from '@ethersproject/wallet'
import debug from 'debug'
import { EthereumAddress, Todo } from '../types'
import { dataUnionMainnetABI, dataUnionSidechainABI, factoryMainnetABI, mainnetAmbABI, sidechainAmbABI } from './abi'
import { until } from '../utils'
import { BigNumber } from '@ethersproject/bignumber'
import StreamrEthereum from '../Ethereum'
import StreamrClient from '../StreamrClient'

const log = debug('StreamrClient::DataUnion')

export class Contracts {

    ethereum: StreamrEthereum
    factoryMainnetAddress: string
    factorySidechainAddress: string
    cachedSidechainAmb?: Todo

    constructor(client: StreamrClient) {
        this.ethereum = client.ethereum
        this.factoryMainnetAddress = client.options.factoryMainnetAddress
        this.factorySidechainAddress = client.options.factorySidechainAddress
    }

    async fetchDataUnionMainnetAddress(
        dataUnionName: string,
        deployerAddress: EthereumAddress
    ): Promise<EthereumAddress> {
        const provider = this.ethereum.getMainnetProvider()
        const factoryMainnet = new Contract(this.factoryMainnetAddress, factoryMainnetABI, provider)
        return factoryMainnet.mainnetAddress(deployerAddress, dataUnionName)
    }

    getDataUnionMainnetAddress(dataUnionName: string, deployerAddress: EthereumAddress) {
        if (!this.factoryMainnetAddress) {
            throw new Error('StreamrClient has no factoryMainnetAddress configuration.')
        }
        // NOTE! this must be updated when DU sidechain smartcontract changes: keccak256(CloneLib.cloneBytecode(data_union_mainnet_template));
        const codeHash = '0x50a78bac973bdccfc8415d7d9cfd62898b8f7cf6e9b3a15e7d75c0cb820529eb'
        const salt = keccak256(defaultAbiCoder.encode(['string', 'address'], [dataUnionName, deployerAddress]))
        return getCreate2Address(this.factoryMainnetAddress, salt, codeHash)
    }

    async fetchDataUnionSidechainAddress(duMainnetAddress: EthereumAddress): Promise<EthereumAddress> {
        const provider = this.ethereum.getMainnetProvider()
        const factoryMainnet = new Contract(this.factoryMainnetAddress, factoryMainnetABI, provider)
        return factoryMainnet.sidechainAddress(duMainnetAddress)
    }

    getDataUnionSidechainAddress(mainnetAddress: EthereumAddress) {
        if (!this.factorySidechainAddress) {
            throw new Error('StreamrClient has no factorySidechainAddress configuration.')
        }
        // NOTE! this must be updated when DU sidechain smartcontract changes: keccak256(CloneLib.cloneBytecode(data_union_sidechain_template))
        const codeHash = '0x040cf686e25c97f74a23a4bf01c29dd77e260c4b694f5611017ce9713f58de83'
        return getCreate2Address(this.factorySidechainAddress, hexZeroPad(mainnetAddress, 32), codeHash)
    }

    getMainnetContractReadOnly(contractAddress: EthereumAddress) {
        if (isAddress(contractAddress)) {
            const provider = this.ethereum.getMainnetProvider()
            return new Contract(contractAddress, dataUnionMainnetABI, provider)
        }
        throw new Error(`${contractAddress} was not a good Ethereum address`)
    }

    getMainnetContract(contractAddress: EthereumAddress) {
        const du = this.getMainnetContractReadOnly(contractAddress)
        const signer = this.ethereum.getSigner()
        return du.connect(signer)
    }

    async getSidechainContract(contractAddress: EthereumAddress) {
        const signer = await this.ethereum.getSidechainSigner()
        const duMainnet = this.getMainnetContractReadOnly(contractAddress)
        const duSidechainAddress = this.getDataUnionSidechainAddress(duMainnet.address)
        const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, signer)
        return duSidechain
    }

    async getSidechainContractReadOnly(contractAddress: EthereumAddress) {
        const provider = this.ethereum.getSidechainProvider()
        const duMainnet = this.getMainnetContractReadOnly(contractAddress)
        const duSidechainAddress = this.getDataUnionSidechainAddress(duMainnet.address)
        const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, provider)
        return duSidechain
    }

    // Find the Asyncronous Message-passing Bridge sidechain ("home") contract
    async getSidechainAmb() {
        if (!this.cachedSidechainAmb) {
            const getAmbPromise = async () => {
                const mainnetProvider = this.ethereum.getMainnetProvider()
                const factoryMainnet = new Contract(this.factoryMainnetAddress, factoryMainnetABI, mainnetProvider)
                const sidechainProvider = this.ethereum.getSidechainProvider()
                const factorySidechainAddress = await factoryMainnet.data_union_sidechain_factory() // TODO use getDataUnionSidechainAddress()
                const factorySidechain = new Contract(factorySidechainAddress, [{
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
        const mainnetProvider = this.ethereum.getMainnetProvider()
        const factoryMainnet = new Contract(this.factoryMainnetAddress, factoryMainnetABI, mainnetProvider)
        const mainnetAmbAddress = await factoryMainnet.amb()
        return new Contract(mainnetAmbAddress, mainnetAmbABI, mainnetProvider)
    }

    async requiredSignaturesHaveBeenCollected(messageHash: Todo) {
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

    // move signatures from sidechain to mainnet
    async transportSignatures(messageHash: string) {
        const sidechainAmb = await this.getSidechainAmb()
        const message = await sidechainAmb.message(messageHash)
        const messageId = '0x' + message.substr(2, 64)
        const sigCountStruct = await sidechainAmb.numMessagesSigned(messageHash)
        const collectedSignatureCount = sigCountStruct.mask(255).toNumber()

        log(`${collectedSignatureCount} signatures reported, getting them from the sidechain AMB...`)
        const signatures = await Promise.all(Array(collectedSignatureCount).fill(0).map(async (_, i) => sidechainAmb.signature(messageHash, i)))

        const [vArray, rArray, sArray]: Todo = [[], [], []]
        signatures.forEach((signature: string, i) => {
            log(`  Signature ${i}: ${signature} (len=${signature.length}=${signature.length / 2 - 1} bytes)`)
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
                log('This could happen if payForSignatureTransport=true, but bridge operator also pays for signatures, and got there before your client')
                return null
            }

            log('Gas estimation failed: Check if number of signatures is enough')
            const mainnetProvider = this.ethereum.getMainnetProvider()
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
        const txAMB = await mainnetAmb.connect(signer).executeSignatures(message, packedSignatures)
        const trAMB = await txAMB.wait()
        return trAMB
    }

    async payForSignatureTransport(tr: { events: any[] }, options: { pollingIntervalMs?: number, retryTimeoutMs?: number } = {}) {
        const {
            pollingIntervalMs = 1000,
            retryTimeoutMs = 60000,
        } = options
        log(`Got receipt, filtering UserRequestForSignature from ${tr.events.length} events...`)
        // event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData);
        const sigEventArgsArray = tr.events.filter((e: Todo) => e.event === 'UserRequestForSignature').map((e: Todo) => e.args)
        if (sigEventArgsArray.length < 1) {
            throw new Error("No UserRequestForSignature events emitted from withdraw transaction, can't transport withdraw to mainnet")
        }
        /* eslint-disable no-await-in-loop */
        // eslint-disable-next-line no-restricted-syntax
        for (const eventArgs of sigEventArgsArray) {
            const messageId = eventArgs[0]
            const messageHash = keccak256(eventArgs[1])

            log(`Waiting until sidechain AMB has collected required signatures for hash=${messageHash}...`)
            await until(async () => this.requiredSignaturesHaveBeenCollected(messageHash), pollingIntervalMs, retryTimeoutMs)

            log(`Checking mainnet AMB hasn't already processed messageId=${messageId}`)
            const mainnetAmb = await this.getMainnetAmb()
            const alreadySent = await mainnetAmb.messageCallStatus(messageId)
            const failAddress = await mainnetAmb.failedMessageSender(messageId)
            if (alreadySent || failAddress !== '0x0000000000000000000000000000000000000000') { // zero address means no failed messages
                log(`WARNING: Mainnet bridge has already processed withdraw messageId=${messageId}`)
                log([
                    'This could happen if payForSignatureTransport=true, but bridge operator also pays for',
                    'signatures, and got there before your client',
                ].join(' '))
                continue
            }

            log(`Transporting signatures for hash=${messageHash}`)
            await this.transportSignatures(messageHash)
        }
        /* eslint-enable no-await-in-loop */
    }

    async deployDataUnion({
        ownerAddress,
        agentAddressList,
        duName,
        deployerAddress,
        adminFeeBN,
        sidechainRetryTimeoutMs,
        sidechainPollingIntervalMs,
        confirmations,
        gasPrice
    }: {
        ownerAddress: EthereumAddress,
        agentAddressList: EthereumAddress[]
        duName: string
        deployerAddress: EthereumAddress
        adminFeeBN: BigNumber
        sidechainRetryTimeoutMs: number
        sidechainPollingIntervalMs: number
        confirmations: number
        gasPrice?: BigNumber,
    }) {
        const mainnetProvider = this.ethereum.getMainnetProvider()
        const mainnetWallet = this.ethereum.getSigner()
        const sidechainProvider = this.ethereum.getSidechainProvider()

        const duMainnetAddress = await this.fetchDataUnionMainnetAddress(duName, deployerAddress)
        const duSidechainAddress = await this.fetchDataUnionSidechainAddress(duMainnetAddress)

        if (await mainnetProvider.getCode(duMainnetAddress) !== '0x') {
            throw new Error(`Mainnet data union "${duName}" contract ${duMainnetAddress} already exists!`)
        }

        if (!isAddress(this.factoryMainnetAddress)) {
            throw new Error('StreamrClient has invalid factoryMainnetAddress configuration.')
        }

        if (await mainnetProvider.getCode(this.factoryMainnetAddress) === '0x') {
            throw new Error(`Data union factory contract not found at ${this.factoryMainnetAddress}, check StreamrClient.options.factoryMainnetAddress!`)
        }

        const factoryMainnet = new Contract(this.factoryMainnetAddress!, factoryMainnetABI, mainnetWallet)
        const ethersOptions: any = {}
        if (gasPrice) {
            ethersOptions.gasPrice = gasPrice
        }
        const tx = await factoryMainnet.deployNewDataUnion(
            ownerAddress,
            adminFeeBN,
            agentAddressList,
            duName,
            ethersOptions
        )
        const tr = await tx.wait(confirmations)

        log(`Data Union "${duName}" (mainnet: ${duMainnetAddress}, sidechain: ${duSidechainAddress}) deployed to mainnet, waiting for side-chain...`)
        await until(
            async () => await sidechainProvider.getCode(duSidechainAddress) !== '0x',
            sidechainRetryTimeoutMs,
            sidechainPollingIntervalMs
        )

        const dataUnion = new Contract(duMainnetAddress, dataUnionMainnetABI, mainnetWallet)
        // @ts-expect-error
        dataUnion.deployTxReceipt = tr
        // @ts-expect-error
        dataUnion.sidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, sidechainProvider)
        return dataUnion

    }
}
