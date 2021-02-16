/**
 * Streamr Data Union related functions
 *
 * Table of Contents:
 *      ABIs
 *      helper utils
 *      admin: DEPLOY AND SETUP DATA UNION  Functions for deploying the contract and adding secrets for smooth joining
 *      admin: MANAGE DATA UNION            Kick and add members
 *      member: JOIN & QUERY DATA UNION     Publicly available info about dataunions and their members (with earnings and proofs)
 *      member: WITHDRAW EARNINGS           Withdrawing functions, there's many: normal, agent, donate
 */

import { getAddress, isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { arrayify, hexZeroPad } from '@ethersproject/bytes'
import { Contract } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'
import { verifyMessage } from '@ethersproject/wallet'
import debug from 'debug'
import StreamrClient from '../StreamrClient'
import { Todo } from '../types'

import { until, getEndpointUrl } from '../utils'

import authFetch from './authFetch'

export interface DataUnionOptions {
    wallet?: Todo,
    provider?: Todo,
    confirmations?: Todo,
    gasPrice?: Todo,
    dataUnion?: Todo,
    tokenAddress?: Todo,
    minimumWithdrawTokenWei?: BigNumber|number|string,
    sidechainTokenAddress?: string,
    factoryMainnetAddress?: string,
    sidechainAmbAddress?: string,
    payForSignatureTransport?: boolean
}

const log = debug('StreamrClient::DataUnionEndpoints')
// const log = console.log // useful for debugging sometimes

// ///////////////////////////////////////////////////////////////////////
//          ABIs: contract functions we want to call within the client
// ///////////////////////////////////////////////////////////////////////

const dataUnionMainnetABI = [{
    name: 'sendTokensToBridge',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'token',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'setAdminFee',
    inputs: [{ type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'adminFeeFraction',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}]

const dataUnionSidechainABI = [{
    name: 'addMembers',
    inputs: [{ type: 'address[]', internalType: 'address payable[]', }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'partMembers',
    inputs: [{ type: 'address[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAll',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAllTo',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAllToSigned',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'bool' }, { type: 'bytes' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    // enum ActiveStatus {None, Active, Inactive, Blocked}
    // struct MemberInfo {
    //     ActiveStatus status;
    //     uint256 earnings_before_last_join;
    //     uint256 lme_at_join;
    //     uint256 withdrawnEarnings;
    // }
    name: 'memberData',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    inputs: [],
    name: 'getStats',
    outputs: [{ type: 'uint256[6]' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'getEarnings',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'getWithdrawableEarnings',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'lifetimeMemberEarnings',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'totalWithdrawable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'totalEarnings',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'activeMemberCount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    // this event is emitted by withdrawing process,
    //   see https://github.com/poanetwork/tokenbridge-contracts/blob/master/contracts/upgradeable_contracts/arbitrary_message/HomeAMB.sol
    name: 'UserRequestForSignature',
    inputs: [
        { indexed: true, name: 'messageId', type: 'bytes32' },
        { indexed: false, name: 'encodedData', type: 'bytes' }
    ],
    anonymous: false,
    type: 'event'
}]

// Only the part of ABI that is needed by deployment (and address resolution)
const factoryMainnetABI = [{
    type: 'constructor',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    stateMutability: 'nonpayable'
}, {
    name: 'sidechainAddress',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'mainnetAddress',
    inputs: [{ type: 'address' }, { type: 'string' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'deployNewDataUnion',
    inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'string' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'amb',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'data_union_sidechain_factory',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}]

const mainnetAmbABI = [{
    name: 'executeSignatures',
    inputs: [{ type: 'bytes' }, { type: 'bytes' }], // data, signatures
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'messageCallStatus',
    inputs: [{ type: 'bytes32' }], // messageId
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'failedMessageSender',
    inputs: [{ type: 'bytes32' }], // messageId
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'relayedMessages',
    inputs: [{ type: 'bytes32' }], // messageId, was called "_txhash" though?!
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'validatorContract',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}]

const sidechainAmbABI = [{
    name: 'signature',
    inputs: [{ type: 'bytes32' }, { type: 'uint256' }], // messageHash, index
    outputs: [{ type: 'bytes' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'message',
    inputs: [{ type: 'bytes32' }], // messageHash
    outputs: [{ type: 'bytes' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'requiredSignatures',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'numMessagesSigned',
    inputs: [{ type: 'bytes32' }], // messageHash (TODO: double check)
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}]

// //////////////////////////////////////////////////////////////////
//          Contract utils
// //////////////////////////////////////////////////////////////////

/** @typedef {String} EthereumAddress */

function throwIfBadAddress(address: string, variableDescription: Todo) {
    try {
        return getAddress(address)
    } catch (e) {
        throw new Error(`${variableDescription || 'Error'}: Bad Ethereum address ${address}. Original error: ${e.stack}.`)
    }
}

/**
 * Parse address, or use this client's auth address if input not given
 * @param {StreamrClient} this
 * @param {EthereumAddress} inputAddress from user (NOT case sensitive)
 * @returns {EthereumAddress} with checksum case
 */
function parseAddress(client: StreamrClient, inputAddress: string|null|undefined) {
    if (inputAddress && isAddress(inputAddress)) {
        return getAddress(inputAddress)
    }
    return client.getAddress()
}

// Find the Asyncronous Message-passing Bridge sidechain ("home") contract
let cachedSidechainAmb: Todo
async function getSidechainAmb(client: StreamrClient, options: DataUnionOptions) {
    if (!cachedSidechainAmb) {
        const getAmbPromise = async () => {
            const mainnetProvider = client.ethereum.getMainnetProvider()
            const factoryMainnetAddress = options.factoryMainnetAddress || client.options.factoryMainnetAddress
            const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, mainnetProvider)
            const sidechainProvider = client.ethereum.getSidechainProvider()
            const factorySidechainAddress = await factoryMainnet.data_union_sidechain_factory()
            const factorySidechain = new Contract(factorySidechainAddress, [{
                name: 'amb',
                inputs: [],
                outputs: [{ type: 'address' }],
                stateMutability: 'view',
                type: 'function'
            // @ts-expect-error
            }], sidechainProvider)
            const sidechainAmbAddress = await factorySidechain.amb()
            // @ts-expect-error
            return new Contract(sidechainAmbAddress, sidechainAmbABI, sidechainProvider)
        }
        cachedSidechainAmb = getAmbPromise()
        cachedSidechainAmb = await cachedSidechainAmb // eslint-disable-line require-atomic-updates
    }
    return cachedSidechainAmb
}

async function getMainnetAmb(client: StreamrClient, options: DataUnionOptions) {
    const mainnetProvider = client.ethereum.getMainnetProvider()
    const factoryMainnetAddress = options.factoryMainnetAddress || client.options.factoryMainnetAddress
    const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, mainnetProvider)
    const mainnetAmbAddress = await factoryMainnet.amb()
    return new Contract(mainnetAmbAddress, mainnetAmbABI, mainnetProvider)
}

async function requiredSignaturesHaveBeenCollected(client: StreamrClient, messageHash: Todo, options: DataUnionOptions = {}) {
    const sidechainAmb = await getSidechainAmb(client, options)
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
async function transportSignatures(client: StreamrClient, messageHash: Todo, options: DataUnionOptions) {
    const sidechainAmb = await getSidechainAmb(client, options)
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
    const mainnetAmb = await getMainnetAmb(client, options)
    log(`Estimating gas using mainnet AMB @ ${mainnetAmb.address}, message=${message}`)
    let gasLimit
    try {
        // magic number suggested by https://github.com/poanetwork/tokenbridge/blob/master/oracle/src/utils/constants.js
        // @ts-expect-error
        gasLimit = await mainnetAmb.estimateGas.executeSignatures(message, packedSignatures) + 200000
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
        const mainnetProvider = client.ethereum.getMainnetProvider()
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

    const signer = client.ethereum.getSigner()
    // @ts-expect-error
    log(`Sending message from signer=${await signer.getAddress()}`)
    // @ts-expect-error
    const txAMB = await mainnetAmb.connect(signer).executeSignatures(message, packedSignatures)
    const trAMB = await txAMB.wait()
    return trAMB
}

// template for withdraw functions
// client could be replaced with AMB (mainnet and sidechain)
async function untilWithdrawIsComplete(client: StreamrClient, getWithdrawTxFunc: (options: DataUnionOptions) => Todo, getBalanceFunc: (options: DataUnionOptions) => Todo, options: DataUnionOptions = {}) {
    const {
        pollingIntervalMs = 1000,
        retryTimeoutMs = 60000,
    }: Todo = options
    const balanceBefore = await getBalanceFunc(options)
    const tx = await getWithdrawTxFunc(options)
    const tr = await tx.wait()

    if (options.payForSignatureTransport) {
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
            await until(async () => requiredSignaturesHaveBeenCollected(client, messageHash, options), pollingIntervalMs, retryTimeoutMs)

            log(`Checking mainnet AMB hasn't already processed messageId=${messageId}`)
            const mainnetAmb = await getMainnetAmb(client, options)
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
            await transportSignatures(client, messageHash, options)
        }
        /* eslint-enable no-await-in-loop */
    }

    log(`Waiting for balance ${balanceBefore.toString()} to change`)
    await until(async () => !(await getBalanceFunc(options)).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs)

    return tr
}

// TODO: calculate addresses in JS instead of asking over RPC, see data-union-solidity/contracts/CloneLib.sol
// key the cache with name only, since PROBABLY one StreamrClient will ever use only one private key
const mainnetAddressCache: Todo = {} // mapping: "name" -> mainnet address
/** @returns {Promise<EthereumAddress>} Mainnet address for Data Union */
async function getDataUnionMainnetAddress(client: StreamrClient, dataUnionName: string, deployerAddress: string, options: DataUnionOptions = {}) {
    if (!mainnetAddressCache[dataUnionName]) {
        const provider = client.ethereum.getMainnetProvider()
        const factoryMainnetAddress = options.factoryMainnetAddress || client.options.factoryMainnetAddress
        const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, provider)
        const addressPromise = factoryMainnet.mainnetAddress(deployerAddress, dataUnionName)
        mainnetAddressCache[dataUnionName] = addressPromise
        mainnetAddressCache[dataUnionName] = await addressPromise // eslint-disable-line require-atomic-updates
    }
    return mainnetAddressCache[dataUnionName]
}

// TODO: calculate addresses in JS
const sidechainAddressCache: Todo = {} // mapping: mainnet address -> sidechain address
/** @returns {Promise<EthereumAddress>} Sidechain address for Data Union */
async function getDataUnionSidechainAddress(client: StreamrClient, duMainnetAddress: string, options: DataUnionOptions = {}) {
    if (!sidechainAddressCache[duMainnetAddress]) {
        const provider = client.ethereum.getMainnetProvider()
        const factoryMainnetAddress = options.factoryMainnetAddress || client.options.factoryMainnetAddress
        const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, provider)
        const addressPromise = factoryMainnet.sidechainAddress(duMainnetAddress)
        sidechainAddressCache[duMainnetAddress] = addressPromise
        sidechainAddressCache[duMainnetAddress] = await addressPromise // eslint-disable-line require-atomic-updates
    }
    return sidechainAddressCache[duMainnetAddress]
}

function getMainnetContractReadOnly(client: StreamrClient, options: DataUnionOptions = {}) {
    // @ts-expect-error
    let dataUnion = options.dataUnion || options.dataUnionAddress || client.options.dataUnion
    if (isAddress(dataUnion)) {
        const provider = client.ethereum.getMainnetProvider()
        dataUnion = new Contract(dataUnion, dataUnionMainnetABI, provider)
    }

    if (!(dataUnion instanceof Contract)) {
        throw new Error(`Option dataUnion=${dataUnion} was not a good Ethereum address or Contract`)
    }
    return dataUnion
}

function getMainnetContract(client: StreamrClient, options: DataUnionOptions = {}) {
    const du = getMainnetContractReadOnly(client, options)
    const signer = client.ethereum.getSigner()
    // @ts-expect-error
    return du.connect(signer)
}

async function getSidechainContract(client: StreamrClient, options: DataUnionOptions = {}) {
    const signer = await client.ethereum.getSidechainSigner()
    const duMainnet = getMainnetContractReadOnly(client, options)
    const duSidechainAddress = await getDataUnionSidechainAddress(client, duMainnet.address, options)
    // @ts-expect-error
    const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, signer)
    return duSidechain
}

async function getSidechainContractReadOnly(client: StreamrClient, options: DataUnionOptions = {}) {
    const provider = await client.ethereum.getSidechainProvider()
    const duMainnet = getMainnetContractReadOnly(client, options)
    const duSidechainAddress = await getDataUnionSidechainAddress(client, duMainnet.address, options)
    // @ts-expect-error
    const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, provider)
    return duSidechain
}

export class DataUnionEndpoints {

    client: StreamrClient

    constructor(client: StreamrClient) {
        this.client = client
    }

    // //////////////////////////////////////////////////////////////////
    //          admin: DEPLOY AND SETUP DATA UNION
    // //////////////////////////////////////////////////////////////////

    async calculateDataUnionMainnetAddress(dataUnionName: string, deployerAddress: string, options: DataUnionOptions) {
        const address = getAddress(deployerAddress) // throws if bad address
        return getDataUnionMainnetAddress(this.client, dataUnionName, address, options)
    }

    async calculateDataUnionSidechainAddress(duMainnetAddress: string, options: DataUnionOptions) {
        const address = getAddress(duMainnetAddress) // throws if bad address
        return getDataUnionSidechainAddress(this.client, address, options)
    }

    /**
     * TODO: update this comment
     * @typedef {object} EthereumOptions all optional, hence "options"
     * @property {Wallet | string} wallet or private key, default is currently logged in StreamrClient (if auth: privateKey)
     * @property {string} key private key, alias for String wallet
     * @property {string} privateKey, alias for String wallet
     * @property {providers.Provider} provider to use in case wallet was a String, or omitted
     * @property {number} confirmations, default is 1
     * @property {BigNumber} gasPrice in wei (part of ethers overrides), default is whatever the network recommends (ethers.js default)
     * @see https://docs.ethers.io/ethers.js/html/api-contract.html#overrides
     */
    /**
     * @typedef {object} AdditionalDeployOptions for deployDataUnion
     * @property {EthereumAddress} owner new data union owner, defaults to StreamrClient authenticated user
     * @property {Array<EthereumAddress>} joinPartAgents defaults to just the owner
     * @property {number} adminFee fraction (number between 0...1 where 1 means 100%)
     * @property {EthereumAddress} factoryMainnetAddress defaults to StreamrClient options
     * @property {string} dataUnionName unique (to the DataUnionFactory) identifier of the new data union, must not exist yet
     */
    /**
     * @typedef {EthereumOptions & AdditionalDeployOptions} DeployOptions
     */
    // TODO: gasPrice to overrides (not needed for browser, but would be useful in node.js)

    /**
     * Create a new DataUnionMainnet contract to mainnet with DataUnionFactoryMainnet
     * This triggers DataUnionSidechain contract creation in sidechain, over the bridge (AMB)
     * @param {DeployOptions} options such as adminFee (default: 0)
     * @return {Promise<Contract>} that resolves when the new DU is deployed over the bridge to side-chain
     */
    async deployDataUnion(options: DataUnionOptions = {}) {
        const {
            owner,
            joinPartAgents,
            dataUnionName,
            adminFee = 0,
            sidechainPollingIntervalMs = 1000,
            sidechainRetryTimeoutMs = 600000,
        }: Todo = options

        let duName = dataUnionName
        if (!duName) {
            duName = `DataUnion-${Date.now()}` // TODO: use uuid
            log(`dataUnionName generated: ${duName}`)
        }

        if (adminFee < 0 || adminFee > 1) { throw new Error('options.adminFeeFraction must be a number between 0...1, got: ' + adminFee) }
        const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

        const mainnetProvider = this.client.ethereum.getMainnetProvider()
        const mainnetWallet = this.client.ethereum.getSigner()
        const sidechainProvider = this.client.ethereum.getSidechainProvider()

        // parseAddress defaults to authenticated user (also if "owner" is not an address)
        const ownerAddress = parseAddress(this.client, owner)

        let agentAddressList
        if (Array.isArray(joinPartAgents)) {
            // getAddress throws if there's an invalid address in the array
            agentAddressList = joinPartAgents.map(getAddress)
        } else {
            // streamrNode needs to be joinPartAgent so that EE join with secret works (and join approvals from Marketplace UI)
            agentAddressList = [ownerAddress]
            if (this.client.options.streamrNodeAddress) {
                agentAddressList.push(getAddress(this.client.options.streamrNodeAddress))
            }
        }

        // @ts-expect-error
        const duMainnetAddress = await getDataUnionMainnetAddress(this.client, duName, ownerAddress, options)
        const duSidechainAddress = await getDataUnionSidechainAddress(this.client, duMainnetAddress, options)

        if (await mainnetProvider.getCode(duMainnetAddress) !== '0x') {
            throw new Error(`Mainnet data union "${duName}" contract ${duMainnetAddress} already exists!`)
        }

        const factoryMainnetAddress = throwIfBadAddress(
            (options.factoryMainnetAddress || this.client.options.factoryMainnetAddress)!,
            'StreamrClient.options.factoryMainnetAddress'
        )
        if (await mainnetProvider.getCode(factoryMainnetAddress) === '0x') {
            throw new Error(`Data union factory contract not found at ${factoryMainnetAddress}, check StreamrClient.options.factoryMainnetAddress!`)
        }

        // function deployNewDataUnion(address owner, uint256 adminFeeFraction, address[] agents, string duName)
        // @ts-expect-error
        const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, mainnetWallet)
        const tx = await factoryMainnet.deployNewDataUnion(
            ownerAddress,
            adminFeeBN,
            agentAddressList,
            duName,
        )
        const tr = await tx.wait()

        log(`Data Union "${duName}" (mainnet: ${duMainnetAddress}, sidechain: ${duSidechainAddress}) deployed to mainnet, waiting for side-chain...`)
        await until(
            // @ts-expect-error
            async () => await sidechainProvider.getCode(duSidechainAddress) !== '0x',
            sidechainRetryTimeoutMs,
            sidechainPollingIntervalMs
        )

        // @ts-expect-error
        const dataUnion = new Contract(duMainnetAddress, dataUnionMainnetABI, mainnetWallet)
        // @ts-expect-error
        dataUnion.deployTxReceipt = tr
        // @ts-expect-error
        dataUnion.sidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, sidechainProvider)
        return dataUnion
    }

    async getDataUnionContract(options: DataUnionOptions = {}) {
        const ret = getMainnetContract(this.client, options)
        // @ts-expect-error
        ret.sidechain = await getSidechainContract(this.client, options)
        return ret
    }

    /**
     * Add a new data union secret
     * @param {EthereumAddress} dataUnionMainnetAddress
     * @param {String} name describes the secret
     * @returns {String} the server-generated secret
     */
    async createSecret(dataUnionMainnetAddress: string, name: string = 'Untitled Data Union Secret') {
        const duAddress = getAddress(dataUnionMainnetAddress) // throws if bad address
        const url = getEndpointUrl(this.client.options.restUrl, 'dataunions', duAddress, 'secrets')
        const res = await authFetch(
            url,
            this.client.session,
            {
                method: 'POST',
                body: JSON.stringify({
                    name
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        )
        return res.secret
    }

    // //////////////////////////////////////////////////////////////////
    //          admin: MANAGE DATA UNION
    // //////////////////////////////////////////////////////////////////

    /**
     * Kick given members from data union
     * @param {List<EthereumAddress>} memberAddressList to kick
     * @returns {Promise<TransactionReceipt>} partMembers sidechain transaction
     */
    async kick(memberAddressList: string[], options: DataUnionOptions = {}) {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await getSidechainContract(this.client, options)
        const tx = await duSidechain.partMembers(members)
        // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return tx.wait(options.confirmations || 1)
    }

    /**
     * Add given Ethereum addresses as data union members
     * @param {List<EthereumAddress>} memberAddressList to add
     * @returns {Promise<TransactionReceipt>} addMembers sidechain transaction
     */
    async addMembers(memberAddressList: string[], options: DataUnionOptions = {}) {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await getSidechainContract(this.client, options)
        const tx = await duSidechain.addMembers(members)
        // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return tx.wait(options.confirmations || 1)
    }

    /**
     * Admin: withdraw earnings (pay gas) on behalf of a member
     * TODO: add test
     * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
     */
    async withdrawMember(memberAddress: string, options: DataUnionOptions) {
        const address = getAddress(memberAddress) // throws if bad address
        const tr = await untilWithdrawIsComplete(
            this.client,
            (opts) => this.getWithdrawMemberTx(address, opts),
            (opts) => this.getTokenBalance(address, opts),
            { ...this.client.options, ...options }
        )
        return tr
    }

    /**
     * Admin: get the tx promise for withdrawing all earnings on behalf of a member
     * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
     * @param {EthereumAddress} dataUnion to withdraw my earnings from
     * @param {EthereumOptions} options
     * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
     */
    async getWithdrawMemberTx(memberAddress: string, options: DataUnionOptions) {
        const a = getAddress(memberAddress) // throws if bad address
        const duSidechain = await getSidechainContract(this.client, options)
        return duSidechain.withdrawAll(a, true) // sendToMainnet=true
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param {EthereumAddress} dataUnion to withdraw my earnings from
     * @param {EthereumAddress} memberAddress the member whose earnings are sent out
     * @param {EthereumAddress} recipientAddress the address to receive the tokens in mainnet
     * @param {string} signature from member, produced using signWithdrawTo
     * @param {EthereumOptions} options
     * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
     */
    async withdrawToSigned(memberAddress: string, recipientAddress: string, signature: string, options: DataUnionOptions) {
        const from = getAddress(memberAddress) // throws if bad address
        const to = getAddress(recipientAddress)
        const tr = await untilWithdrawIsComplete(
            this.client,
            (opts) => this.getWithdrawToSignedTx(from, to, signature, opts),
            (opts) => this.getTokenBalance(to, opts),
            { ...this.client.options, ...options }
        )
        return tr
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param {EthereumAddress} dataUnion to withdraw my earnings from
     * @param {EthereumAddress} memberAddress the member whose earnings are sent out
     * @param {EthereumAddress} recipientAddress the address to receive the tokens in mainnet
     * @param {string} signature from member, produced using signWithdrawTo
     * @param {EthereumOptions} options
     * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
     */
    async getWithdrawToSignedTx(memberAddress: string, recipientAddress: string, signature: string, options: DataUnionOptions) {
        const duSidechain = await getSidechainContract(this.client, options)
        return duSidechain.withdrawAllToSigned(memberAddress, recipientAddress, true, signature) // sendToMainnet=true
    }

    /**
     * Admin: set admin fee for the data union
     * @param {number} newFeeFraction between 0.0 and 1.0
     * @param {EthereumOptions} options
     */
    async setAdminFee(newFeeFraction: number, options: DataUnionOptions) {
        if (newFeeFraction < 0 || newFeeFraction > 1) {
            throw new Error('newFeeFraction argument must be a number between 0...1, got: ' + newFeeFraction)
        }
        const adminFeeBN = BigNumber.from((newFeeFraction * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish
        const duMainnet = getMainnetContract(this.client, options)
        const tx = await duMainnet.setAdminFee(adminFeeBN)
        return tx.wait()
    }

    /**
     * Get data union admin fee fraction that admin gets from each revenue event
     * @returns {number} between 0.0 and 1.0
     */
    async getAdminFee(options: DataUnionOptions) {
        const duMainnet = getMainnetContractReadOnly(this.client, options)
        const adminFeeBN = await duMainnet.adminFeeFraction()
        return +adminFeeBN.toString() / 1e18
    }

    async getAdminAddress(options: DataUnionOptions) {
        const duMainnet = getMainnetContractReadOnly(this.client, options)
        return duMainnet.owner()
    }

    // //////////////////////////////////////////////////////////////////
    //          member: JOIN & QUERY DATA UNION
    // //////////////////////////////////////////////////////////////////

    /**
     * Send a joinRequest, or get into data union instantly with a data union secret
     * @param {JoinOptions} options
     *
     * @typedef {object} JoinOptions
     * @property {String} dataUnion Ethereum mainnet address of the data union. If not given, use one given when creating StreamrClient
     * @property {String} member Ethereum mainnet address of the joining member. If not given, use StreamrClient authentication key
     * @property {String} secret if given, and correct, join the data union immediately
     */
    async joinDataUnion(options: DataUnionOptions = {}) {
        const {
            member,
            secret,
        }: Todo = options
        const dataUnion = getMainnetContractReadOnly(this.client, options)

        const body = {
            memberAddress: parseAddress(this.client, member)
        }
        // @ts-expect-error
        if (secret) { body.secret = secret }

        const url = getEndpointUrl(this.client.options.restUrl, 'dataunions', dataUnion.address, 'joinRequests')
        return authFetch(
            url,
            this.client.session,
            {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        )
    }

    /**
     * Await this function when you want to make sure a member is accepted in the data union
     * @param {EthereumAddress} memberAddress (optional, default is StreamrClient's auth: privateKey)
     * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if member is in
     * @param {Number} retryTimeoutMs (optional, default: 60000) give up
     * @return {Promise} resolves when member is in the data union (or fails with HTTP error)
     */
    async hasJoined(memberAddress: string, options: DataUnionOptions = {}) {
        const {
            pollingIntervalMs = 1000,
            retryTimeoutMs = 60000,
        }: Todo = options
        const address = parseAddress(this.client, memberAddress)
        const duSidechain = await getSidechainContractReadOnly(this.client, options)

        // memberData[0] is enum ActiveStatus {None, Active, Inactive}, and zero means member has never joined
        await until(async () => (await duSidechain.memberData(address))[0] !== 0, retryTimeoutMs, pollingIntervalMs)
    }

    // TODO: this needs more thought: probably something like getEvents from sidechain? Heavy on RPC?
    async getMembers(options: DataUnionOptions) {
        const duSidechain = await getSidechainContractReadOnly(this.client, options)
        throw new Error(`Not implemented for side-chain data union (at ${duSidechain.address})`)
        // event MemberJoined(address indexed);
        // event MemberParted(address indexed);
    }

    async getDataUnionStats(options: DataUnionOptions) {
        const duSidechain = await getSidechainContractReadOnly(this.client, options)
        const [
            totalEarnings,
            totalEarningsWithdrawn,
            activeMemberCount,
            inactiveMemberCount,
            lifetimeMemberEarnings,
            joinPartAgentCount,
        ] = await duSidechain.getStats()
        const totalWithdrawable = totalEarnings.sub(totalEarningsWithdrawn)
        return {
            activeMemberCount,
            inactiveMemberCount,
            joinPartAgentCount,
            totalEarnings,
            totalWithdrawable,
            lifetimeMemberEarnings,
        }
    }

    /**
     * Get stats of a single data union member
     * @param {EthereumAddress} dataUnion to query
     * @param {EthereumAddress} memberAddress (optional) if not supplied, get the stats of currently logged in StreamrClient (if auth: privateKey)
     */
    async getMemberStats(memberAddress: string, options: DataUnionOptions) {
        const address = parseAddress(this.client, memberAddress)
        // TODO: use duSidechain.getMemberStats(address) once it's implemented, to ensure atomic read
        //        (so that memberData is from same block as getEarnings, otherwise withdrawable will be foobar)
        const duSidechain = await getSidechainContractReadOnly(this.client, options)
        const mdata = await duSidechain.memberData(address)
        const total = await duSidechain.getEarnings(address).catch(() => 0)
        const withdrawnEarnings = mdata[3].toString()
        const withdrawable = total ? total.sub(withdrawnEarnings) : 0
        return {
            status: ['unknown', 'active', 'inactive', 'blocked'][mdata[0]],
            earningsBeforeLastJoin: mdata[1].toString(),
            lmeAtJoin: mdata[2].toString(),
            totalEarnings: total.toString(),
            withdrawableEarnings: withdrawable.toString(),
        }
    }

    /**
     * Get the amount of tokens the member would get from a successful withdraw
     * @param dataUnion to query
     * @param memberAddress whose balance is returned
     * @return {Promise<BigNumber>}
     */
    async getMemberBalance(memberAddress: string, options: DataUnionOptions) {
        const address = parseAddress(this.client, memberAddress)
        const duSidechain = await getSidechainContractReadOnly(this.client, options)
        return duSidechain.getWithdrawableEarnings(address)
    }

    /**
     * Get token balance for given address
     * @param {EthereumAddress} address
     * @param options such as tokenAddress. If not given, then first check if
     * dataUnion was given in StreamrClient constructor, then check if tokenAddress
     * was given in StreamrClient constructor.
     * @returns {Promise<BigNumber>} token balance in "wei" (10^-18 parts)
     */
    async getTokenBalance(address: string|null|undefined, options: DataUnionOptions) {
        const a = parseAddress(this.client, address)
        const tokenAddressMainnet = options.tokenAddress || (
            await getMainnetContractReadOnly(this.client, options).then((c: Todo) => c.token()).catch(() => null) || this.client.options.tokenAddress
        )
        if (!tokenAddressMainnet) { throw new Error('tokenAddress option not found') }
        const provider = this.client.ethereum.getMainnetProvider()
        const token = new Contract(tokenAddressMainnet, [{
            name: 'balanceOf',
            inputs: [{ type: 'address' }],
            outputs: [{ type: 'uint256' }],
            constant: true,
            payable: false,
            stateMutability: 'view',
            type: 'function'
        }], provider)
        return token.balanceOf(a)
    }

    /**
     * Figure out if given mainnet address is old DataUnion (v 1.0) or current 2.0
     * NOTE: Current version of streamr-client-javascript can only handle current version!
     * @param {EthereumAddress} contractAddress
     * @returns {number} 1 for old, 2 for current, zero for "not a data union"
     */
    async getDataUnionVersion(contractAddress: string) {
        const a = getAddress(contractAddress) // throws if bad address
        const provider = this.client.ethereum.getMainnetProvider()
        const du = new Contract(a, [{
            name: 'version',
            inputs: [],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
        }], provider)
        try {
            const version = await du.version()
            return +version
        } catch (e) {
            return 0
        }
    }

    // //////////////////////////////////////////////////////////////////
    //          member: WITHDRAW EARNINGS
    // //////////////////////////////////////////////////////////////////

    /**
     * Withdraw all your earnings
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw is complete (tokens are seen in mainnet)
     */
    async withdraw(options: DataUnionOptions = {}) {
        const tr = await untilWithdrawIsComplete(
            this.client,
            (opts) => this.getWithdrawTx(opts),
            (opts) => this.getTokenBalance(null, opts), // null means this StreamrClient's auth credentials
            { ...this.client.options, ...options }
        )
        return tr
    }

    /**
     * Get the tx promise for withdrawing all your earnings
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
     */
    async getWithdrawTx(options: DataUnionOptions) {
        const signer = await this.client.ethereum.getSidechainSigner()
        // @ts-expect-error
        const address = await signer.getAddress()
        const duSidechain = await getSidechainContract(this.client, options)

        const withdrawable = await duSidechain.getWithdrawableEarnings(address)
        if (withdrawable.eq(0)) {
            throw new Error(`${address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
        }

        if (this.client.options.minimumWithdrawTokenWei && withdrawable.lt(this.client.options.minimumWithdrawTokenWei)) {
            throw new Error(`${address} has only ${withdrawable} to withdraw in `
                + `(sidechain) data union ${duSidechain.address} (min: ${this.client.options.minimumWithdrawTokenWei})`)
        }
        return duSidechain.withdrawAll(address, true) // sendToMainnet=true
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @param {EthereumAddress} recipientAddress the address to receive the tokens
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw is complete (tokens are seen in mainnet)
     */
    async withdrawTo(recipientAddress: string, options: DataUnionOptions = {}) {
        const to = getAddress(recipientAddress) // throws if bad address
        const tr = await untilWithdrawIsComplete(
            this.client,
            (opts) => this.getWithdrawTxTo(to, opts),
            (opts) => this.getTokenBalance(to, opts),
            { ...this.client.options, ...options }
        )
        return tr
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @param {EthereumAddress} recipientAddress the address to receive the tokens
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
     */
    async getWithdrawTxTo(recipientAddress: string, options: DataUnionOptions) {
        const signer = await this.client.ethereum.getSidechainSigner()
        // @ts-expect-error
        const address = await signer.getAddress()
        const duSidechain = await getSidechainContract(this.client, options)
        const withdrawable = await duSidechain.getWithdrawableEarnings(address)
        if (withdrawable.eq(0)) {
            throw new Error(`${address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
        }
        return duSidechain.withdrawAllTo(recipientAddress, true) // sendToMainnet=true
    }

    /**
     * Member can sign off to "donate" all earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * Note that while it's a "blank cheque" for withdrawing all earnings at the moment it's used, it's
     *   invalidated by the first withdraw after signing it. In other words, any signature can be invalidated
     *   by making a "normal" withdraw e.g. `await streamrClient.withdraw()`
     * Admin can execute the withdraw using this signature: ```
     *   await adminStreamrClient.withdrawToSigned(memberAddress, recipientAddress, signature)
     * ```
     * @param {EthereumAddress} recipientAddress the address authorized to receive the tokens
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {string} signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawTo(recipientAddress: string, options: DataUnionOptions) {
        return this.signWithdrawAmountTo(recipientAddress, BigNumber.from(0), options)
    }

    /**
     * Member can sign off to "donate" specific amount of earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * @param {EthereumAddress} recipientAddress the address authorized to receive the tokens
     * @param {BigNumber|number|string} amountTokenWei that the signature is for (can't be used for less or for more)
     * @param {EthereumOptions} options (including e.g. `dataUnion` Contract object or address)
     * @returns {string} signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAmountTo(recipientAddress: string, amountTokenWei: BigNumber|number|string, options: DataUnionOptions) {
        const to = getAddress(recipientAddress) // throws if bad address
        const signer = this.client.ethereum.getSigner() // it shouldn't matter if it's mainnet or sidechain signer since key should be the same
        // @ts-expect-error
        const address = await signer.getAddress()
        const duSidechain = await getSidechainContractReadOnly(this.client, options)
        const memberData = await duSidechain.memberData(address)
        if (memberData[0] === '0') { throw new Error(`${address} is not a member in Data Union (sidechain address ${duSidechain.address})`) }
        const withdrawn = memberData[3]
        // @ts-expect-error
        const message = to + hexZeroPad(amountTokenWei, 32).slice(2) + duSidechain.address.slice(2) + hexZeroPad(withdrawn, 32).slice(2)
        // @ts-expect-error
        const signature = await signer.signMessage(arrayify(message))
        return signature
    }
}

