/**
 * Streamr Data Union related functions
 *
 * Table of Contents:
 *      ABIs
 *      helper utils
 *      admin: DEPLOY AND SETUP DATA UNION  Functions for deploying the contract and adding secrets for smooth joining
 *      admin: MANAGE DATA UNION            add and part members
 *      member: JOIN & QUERY DATA UNION     Publicly available info about dataunions and their members (with earnings and proofs)
 *      member: WITHDRAW EARNINGS           Withdrawing functions, there's many: normal, agent, donate
 */

import { getAddress, getCreate2Address, isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { arrayify, hexZeroPad } from '@ethersproject/bytes'
import { Contract } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'
import { defaultAbiCoder } from '@ethersproject/abi'
import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers'
import { verifyMessage } from '@ethersproject/wallet'
import debug from 'debug'
import { DataUnionDeployOptions, DataUnionMemberListModificationOptions, DataUnionWithdrawOptions } from '../dataunion/DataUnion'
import StreamrClient from '../StreamrClient'
import { Todo } from '../types'

import { until, getEndpointUrl } from '../utils'

import authFetch from './authFetch'

export interface DataUnionStats {
    activeMemberCount: Todo,
    inactiveMemberCount: Todo,
    joinPartAgentCount: Todo,
    totalEarnings: Todo,
    totalWithdrawable: Todo,
    lifetimeMemberEarnings: Todo
}

export interface MemberStats {
    status: Todo
    earningsBeforeLastJoin: Todo
    lmeAtJoin: Todo
    totalEarnings: Todo
    withdrawableEarnings: Todo
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

type EthereumAddress = string

function throwIfBadAddress(address: string, variableDescription: Todo) {
    try {
        return getAddress(address)
    } catch (e) {
        throw new Error(`${variableDescription || 'Error'}: Bad Ethereum address ${address}. Original error: ${e.stack}.`)
    }
}

// Find the Asyncronous Message-passing Bridge sidechain ("home") contract
let cachedSidechainAmb: Todo
async function getSidechainAmb(client: StreamrClient) {
    if (!cachedSidechainAmb) {
        const getAmbPromise = async () => {
            const mainnetProvider = client.ethereum.getMainnetProvider()
            const { factoryMainnetAddress } = client.options
            const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, mainnetProvider)
            const sidechainProvider = client.ethereum.getSidechainProvider()
            const factorySidechainAddress = await factoryMainnet.data_union_sidechain_factory() // TODO use getDataUnionSidechainAddress()
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

async function getMainnetAmb(client: StreamrClient) {
    const mainnetProvider = client.ethereum.getMainnetProvider()
    const { factoryMainnetAddress } = client.options
    const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, mainnetProvider)
    const mainnetAmbAddress = await factoryMainnet.amb()
    return new Contract(mainnetAmbAddress, mainnetAmbABI, mainnetProvider)
}

async function requiredSignaturesHaveBeenCollected(client: StreamrClient, messageHash: Todo) {
    const sidechainAmb = await getSidechainAmb(client)
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
async function transportSignatures(client: StreamrClient, messageHash: string) {
    const sidechainAmb = await getSidechainAmb(client)
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
    const mainnetAmb = await getMainnetAmb(client)
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
async function untilWithdrawIsComplete(
    client: StreamrClient,
    getWithdrawTxFunc: () => Promise<Todo & { events: any[] }>,
    getBalanceFunc: () => Promise<BigNumber>,
    options: DataUnionWithdrawOptions = {}
) {
    const {
        pollingIntervalMs = 1000,
        retryTimeoutMs = 60000,
    }: Todo = options
    const balanceBefore = await getBalanceFunc()
    const tx = await getWithdrawTxFunc()
    const tr = await tx.wait()

    if (options.payForSignatureTransport || client.options.payForSignatureTransport) {
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
            await until(async () => requiredSignaturesHaveBeenCollected(client, messageHash), pollingIntervalMs, retryTimeoutMs)

            log(`Checking mainnet AMB hasn't already processed messageId=${messageId}`)
            const mainnetAmb = await getMainnetAmb(client)
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
            await transportSignatures(client, messageHash)
        }
        /* eslint-enable no-await-in-loop */
    }

    log(`Waiting for balance ${balanceBefore.toString()} to change`)
    await until(async () => !(await getBalanceFunc()).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs)

    return tr
}

// TODO remove caching as we calculate the values only when deploying the DU
const mainnetAddressCache: Todo = {} // mapping: "name" -> mainnet address

/** @returns Mainnet address for Data Union */
async function fetchDataUnionMainnetAddress(
    client: StreamrClient,
    dataUnionName: string,
    deployerAddress: EthereumAddress
): Promise<EthereumAddress> {
    if (!mainnetAddressCache[dataUnionName]) {
        const provider = client.ethereum.getMainnetProvider()
        const { factoryMainnetAddress } = client.options
        const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, provider)
        const addressPromise = factoryMainnet.mainnetAddress(deployerAddress, dataUnionName)
        mainnetAddressCache[dataUnionName] = addressPromise
        mainnetAddressCache[dataUnionName] = await addressPromise // eslint-disable-line require-atomic-updates
    }
    return mainnetAddressCache[dataUnionName]
}

function getDataUnionMainnetAddress(client: StreamrClient, dataUnionName: string, deployerAddress: EthereumAddress) {
    const { factoryMainnetAddress } = client.options
    // NOTE! this must be updated when DU sidechain smartcontract changes: keccak256(CloneLib.cloneBytecode(data_union_mainnet_template));
    const codeHash = '0x50a78bac973bdccfc8415d7d9cfd62898b8f7cf6e9b3a15e7d75c0cb820529eb'
    const salt = keccak256(defaultAbiCoder.encode(['string', 'address'], [dataUnionName, deployerAddress]))
    return getCreate2Address(factoryMainnetAddress, salt, codeHash)
}

// TODO remove caching as we calculate the values only when deploying the DU
const sidechainAddressCache: Todo = {} // mapping: mainnet address -> sidechain address
/** @returns Sidechain address for Data Union */
async function fetchDataUnionSidechainAddress(client: StreamrClient, duMainnetAddress: EthereumAddress): Promise<EthereumAddress> {
    if (!sidechainAddressCache[duMainnetAddress]) {
        const provider = client.ethereum.getMainnetProvider()
        const { factoryMainnetAddress } = client.options
        const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, provider)
        const addressPromise = factoryMainnet.sidechainAddress(duMainnetAddress)
        sidechainAddressCache[duMainnetAddress] = addressPromise
        sidechainAddressCache[duMainnetAddress] = await addressPromise // eslint-disable-line require-atomic-updates
    }
    return sidechainAddressCache[duMainnetAddress]
}

function getDataUnionSidechainAddress(client: StreamrClient, mainnetAddress: EthereumAddress) {
    const { factorySidechainAddress } = client.options
    // NOTE! this must be updated when DU sidechain smartcontract changes: keccak256(CloneLib.cloneBytecode(data_union_sidechain_template))
    const codeHash = '0x040cf686e25c97f74a23a4bf01c29dd77e260c4b694f5611017ce9713f58de83'
    return getCreate2Address(factorySidechainAddress, hexZeroPad(mainnetAddress, 32), codeHash)
}

function getMainnetContractReadOnly(contractAddress: EthereumAddress, client: StreamrClient) {
    if (isAddress(contractAddress)) {
        const provider = client.ethereum.getMainnetProvider()
        return new Contract(contractAddress, dataUnionMainnetABI, provider)
    } else {
        throw new Error(`${contractAddress} was not a good Ethereum address`)
    }
}

function getMainnetContract(contractAddress: EthereumAddress, client: StreamrClient) {
    const du = getMainnetContractReadOnly(contractAddress, client)
    const signer = client.ethereum.getSigner()
    // @ts-expect-error
    return du.connect(signer)
}

async function getSidechainContract(contractAddress: EthereumAddress, client: StreamrClient) {
    const signer = await client.ethereum.getSidechainSigner()
    const duMainnet = getMainnetContractReadOnly(contractAddress, client)
    const duSidechainAddress = getDataUnionSidechainAddress(client, duMainnet.address)
    // @ts-expect-error
    const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, signer)
    return duSidechain
}

async function getSidechainContractReadOnly(contractAddress: EthereumAddress, client: StreamrClient) {
    const provider = client.ethereum.getSidechainProvider()
    const duMainnet = getMainnetContractReadOnly(contractAddress, client)
    const duSidechainAddress = getDataUnionSidechainAddress(client, duMainnet.address)
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

    // TODO inline this function?
    calculateDataUnionMainnetAddress(dataUnionName: string, deployerAddress: EthereumAddress) {
        const address = getAddress(deployerAddress) // throws if bad address
        return getDataUnionMainnetAddress(this.client, dataUnionName, address)
    }

    // TODO inline this function?
    calculateDataUnionSidechainAddress(duMainnetAddress: EthereumAddress) {
        const address = getAddress(duMainnetAddress) // throws if bad address
        return getDataUnionSidechainAddress(this.client, address)
    }

    /**
     * Create a new DataUnionMainnet contract to mainnet with DataUnionFactoryMainnet
     * This triggers DataUnionSidechain contract creation in sidechain, over the bridge (AMB)
     * @return that resolves when the new DU is deployed over the bridge to side-chain
     */
    async deployDataUnion(options: DataUnionDeployOptions = {}): Promise<Contract> {
        const {
            owner,
            joinPartAgents,
            dataUnionName,
            adminFee = 0,
            sidechainPollingIntervalMs = 1000,
            sidechainRetryTimeoutMs = 600000,
            confirmations = 1,
            gasPrice
        } = options

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

        const ownerAddress = (owner) ? getAddress(owner) : this.client.getAddress()

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

        const deployerAddress = this.client.getAddress()
        // @ts-expect-error
        const duMainnetAddress = await fetchDataUnionMainnetAddress(this.client, duName, deployerAddress, options)
        const duSidechainAddress = await fetchDataUnionSidechainAddress(this.client, duMainnetAddress)

        if (await mainnetProvider.getCode(duMainnetAddress) !== '0x') {
            throw new Error(`Mainnet data union "${duName}" contract ${duMainnetAddress} already exists!`)
        }

        const factoryMainnetAddress = throwIfBadAddress(
            this.client.options.factoryMainnetAddress!,
            'StreamrClient.options.factoryMainnetAddress'
        )
        if (await mainnetProvider.getCode(factoryMainnetAddress) === '0x') {
            throw new Error(`Data union factory contract not found at ${factoryMainnetAddress}, check StreamrClient.options.factoryMainnetAddress!`)
        }

        // function deployNewDataUnion(address owner, uint256 adminFeeFraction, address[] agents, string duName)
        // @ts-expect-error
        const factoryMainnet = new Contract(factoryMainnetAddress!, factoryMainnetABI, mainnetWallet)
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

    async getContract(contractAddress: EthereumAddress) {
        const ret = getMainnetContract(contractAddress, this.client)
        // @ts-expect-error
        ret.sidechain = await getSidechainContract(contractAddress, this.client)
        return ret
    }

    /**
     * Add a new data union secret
     */
    async createSecret(dataUnionMainnetAddress: EthereumAddress, name: string = 'Untitled Data Union Secret'): Promise<string> {
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
     * Add given Ethereum addresses as data union members
     */
    async addMembers(
        memberAddressList: string[],
        options: DataUnionMemberListModificationOptions|undefined = {},
        contractAddress: EthereumAddress
    ): Promise<TransactionReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await getSidechainContract(contractAddress, this.client)
        const tx = await duSidechain.addMembers(members)
        // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        const { confirmations = 1 } = options
        return tx.wait(confirmations)
    }

    /**
     * Remove given members from data union
     */
    async removeMembers(
        memberAddressList: string[],
        options: DataUnionMemberListModificationOptions|undefined = {},
        contractAddress: EthereumAddress
    ): Promise<TransactionReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await getSidechainContract(contractAddress, this.client)
        const tx = await duSidechain.partMembers(members)
        // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        const { confirmations = 1 } = options
        return tx.wait(confirmations)
    }

    /**
     * Admin: withdraw earnings (pay gas) on behalf of a member
     * TODO: add test
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @returns Receipt once withdraw transaction is confirmed
     */
    async withdrawAllToMember(
        memberAddress: EthereumAddress,
        options: DataUnionWithdrawOptions|undefined,
        contractAddress: EthereumAddress
    ): Promise<TransactionReceipt> {
        const address = getAddress(memberAddress) // throws if bad address
        const tr = await untilWithdrawIsComplete(
            this.client,
            () => this.getWithdrawAllToMemberTx(address, contractAddress),
            () => this.getTokenBalance(address),
            options
        )
        return tr
    }

    /**
     * Admin: get the tx promise for withdrawing all earnings on behalf of a member
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @returns await on call .wait to actually send the tx
     */
    async getWithdrawAllToMemberTx(memberAddress: EthereumAddress, contractAddress: EthereumAddress): Promise<TransactionResponse> {
        const a = getAddress(memberAddress) // throws if bad address
        const duSidechain = await getSidechainContract(contractAddress, this.client)
        return duSidechain.withdrawAll(a, true) // sendToMainnet=true
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     * @returns receipt once withdraw transaction is confirmed
     */
    async withdrawAllToSigned(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        signature: string,
        options: DataUnionWithdrawOptions|undefined,
        contractAddress: EthereumAddress
    ): Promise<TransactionReceipt> {
        const from = getAddress(memberAddress) // throws if bad address
        const to = getAddress(recipientAddress)
        const tr = await untilWithdrawIsComplete(
            this.client,
            () => this.getWithdrawAllToSignedTx(from, to, signature, contractAddress),
            () => this.getTokenBalance(to),
            options
        )
        return tr
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     * @returns await on call .wait to actually send the tx
     */
    async getWithdrawAllToSignedTx(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        signature: string,
        contractAddress: EthereumAddress
    ): Promise<TransactionResponse> {
        const duSidechain = await getSidechainContract(contractAddress, this.client)
        return duSidechain.withdrawAllToSigned(memberAddress, recipientAddress, true, signature) // sendToMainnet=true
    }

    /**
     * Admin: set admin fee (between 0.0 and 1.0) for the data union
     */
    async setAdminFee(newFeeFraction: number, contractAddress: EthereumAddress): Promise<Todo> {
        if (newFeeFraction < 0 || newFeeFraction > 1) {
            throw new Error('newFeeFraction argument must be a number between 0...1, got: ' + newFeeFraction)
        }
        const adminFeeBN = BigNumber.from((newFeeFraction * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish
        const duMainnet = getMainnetContract(contractAddress, this.client)
        const tx = await duMainnet.setAdminFee(adminFeeBN)
        return tx.wait()
    }

    /**
     * Get data union admin fee fraction (between 0.0 and 1.0) that admin gets from each revenue event
     */
    async getAdminFee(contractAddress: EthereumAddress): Promise<number> {
        const duMainnet = getMainnetContractReadOnly(contractAddress, this.client)
        const adminFeeBN = await duMainnet.adminFeeFraction()
        return +adminFeeBN.toString() / 1e18
    }

    async getAdminAddress(contractAddress: EthereumAddress): Promise<Todo> {
        const duMainnet = getMainnetContractReadOnly(contractAddress, this.client)
        return duMainnet.owner()
    }

    // //////////////////////////////////////////////////////////////////
    //          member: JOIN & QUERY DATA UNION
    // //////////////////////////////////////////////////////////////////

    /**
     * Send a joinRequest, or get into data union instantly with a data union secret
     */
    async join(secret: string|undefined, contractAddress: EthereumAddress): Promise<Todo> {
        const memberAddress = this.client.getAddress() as string
        const body: any = {
            memberAddress
        }
        if (secret) { body.secret = secret }

        const url = getEndpointUrl(this.client.options.restUrl, 'dataunions', contractAddress, 'joinRequests')
        const response = await authFetch(
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
        if (secret) {
            await until(async () => this.isMember(memberAddress, contractAddress))
        }
        return response
    }

    async isMember(memberAddress: EthereumAddress, contractAddress: EthereumAddress): Promise<boolean> {
        const address = getAddress(memberAddress)
        const duSidechain = await getSidechainContractReadOnly(contractAddress, this.client)
        const ACTIVE = 1 // memberData[0] is enum ActiveStatus {None, Active, Inactive}
        const memberData = await duSidechain.memberData(address)
        const state = memberData[0]
        return (state === ACTIVE)
    }

    // TODO: this needs more thought: probably something like getEvents from sidechain? Heavy on RPC?
    async getMembers(contractAddress: EthereumAddress) {
        const duSidechain = await getSidechainContractReadOnly(contractAddress, this.client)
        throw new Error(`Not implemented for side-chain data union (at ${duSidechain.address})`)
        // event MemberJoined(address indexed);
        // event MemberParted(address indexed);
    }

    async getStats(contractAddress: EthereumAddress): Promise<DataUnionStats> {
        const duSidechain = await getSidechainContractReadOnly(contractAddress, this.client)
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
     */
    async getMemberStats(memberAddress: EthereumAddress, contractAddress: EthereumAddress): Promise<MemberStats> {
        const address = getAddress(memberAddress)
        // TODO: use duSidechain.getMemberStats(address) once it's implemented, to ensure atomic read
        //        (so that memberData is from same block as getEarnings, otherwise withdrawable will be foobar)
        const duSidechain = await getSidechainContractReadOnly(contractAddress, this.client)
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
     */
    async getWithdrawableEarnings(memberAddress: EthereumAddress, contractAddress: EthereumAddress): Promise<BigNumber> {
        const address = getAddress(memberAddress)
        const duSidechain = await getSidechainContractReadOnly(contractAddress, this.client)
        return duSidechain.getWithdrawableEarnings(address)
    }

    /**
     * Get token balance in "wei" (10^-18 parts) for given address
     */
    async getTokenBalance(address: string): Promise<BigNumber> {
        const a = getAddress(address)
        const provider = this.client.ethereum.getMainnetProvider()
        const token = new Contract(this.client.options.tokenAddress, [{
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
     */
    async getVersion(contractAddress: EthereumAddress): Promise<number> {
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
            // "not a data union"
            return 0
        }
    }

    // //////////////////////////////////////////////////////////////////
    //          member: WITHDRAW EARNINGS
    // //////////////////////////////////////////////////////////////////

    /**
     * Withdraw all your earnings
     *  @returns receipt once withdraw is complete (tokens are seen in mainnet)
     */
    async withdrawAll(contractAddress: EthereumAddress, options?: DataUnionWithdrawOptions): Promise<TransactionReceipt> {
        const recipientAddress = this.client.getAddress()
        const tr = await untilWithdrawIsComplete(
            this.client,
            () => this.getWithdrawAllTx(contractAddress),
            () => this.getTokenBalance(recipientAddress),
            options
        )
        return tr
    }

    /**
     * Get the tx promise for withdrawing all your earnings
     * @returns await on call .wait to actually send the tx
     */
    async getWithdrawAllTx(contractAddress: EthereumAddress): Promise<TransactionResponse> {
        const signer = await this.client.ethereum.getSidechainSigner()
        // @ts-expect-error
        const address = await signer.getAddress()
        const duSidechain = await getSidechainContract(contractAddress, this.client)

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
     * @returns get receipt once withdraw is complete (tokens are seen in mainnet)
     */
    async withdrawAllTo(
        recipientAddress: EthereumAddress,
        options: DataUnionWithdrawOptions|undefined,
        contractAddress: EthereumAddress
    ): Promise<TransactionReceipt> {
        const to = getAddress(recipientAddress) // throws if bad address
        const tr = await untilWithdrawIsComplete(
            this.client,
            () => this.getWithdrawAllToTx(to, contractAddress),
            () => this.getTokenBalance(to),
            options
        )
        return tr
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @param recipientAddress - the address to receive the tokens
     * @returns await on call .wait to actually send the tx
     */
    async getWithdrawAllToTx(recipientAddress: EthereumAddress, contractAddress: EthereumAddress): Promise<TransactionResponse> {
        const signer = await this.client.ethereum.getSidechainSigner()
        // @ts-expect-error
        const address = await signer.getAddress()
        const duSidechain = await getSidechainContract(contractAddress, this.client)
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
     *   by making a "normal" withdraw e.g. `await streamrClient.withdrawAll()`
     * Admin can execute the withdraw using this signature: ```
     *   await adminStreamrClient.withdrawAllToSigned(memberAddress, recipientAddress, signature)
     * ```
     * @param recipientAddress - the address authorized to receive the tokens
     * @returns signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAllTo(recipientAddress: EthereumAddress, contractAddress: EthereumAddress): Promise<string> {
        return this.signWithdrawAmountTo(recipientAddress, BigNumber.from(0), contractAddress)
    }

    /**
     * Member can sign off to "donate" specific amount of earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * @param recipientAddress - the address authorized to receive the tokens
     * @param amountTokenWei - that the signature is for (can't be used for less or for more)
     * @returns signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAmountTo(
        recipientAddress: EthereumAddress,
        amountTokenWei: BigNumber|number|string,
        contractAddress: EthereumAddress
    ): Promise<string> {
        const to = getAddress(recipientAddress) // throws if bad address
        const signer = this.client.ethereum.getSigner() // it shouldn't matter if it's mainnet or sidechain signer since key should be the same
        // @ts-expect-error
        const address = await signer.getAddress()
        const duSidechain = await getSidechainContractReadOnly(contractAddress, this.client)
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

