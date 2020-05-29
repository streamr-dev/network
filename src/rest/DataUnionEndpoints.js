/**
 * Streamr Data Union related functions
 *
 * Table of Contents:
 *      member: JOIN & QUERY DATA UNION     Publicly available info about dataunions and their members (with earnings and proofs)
 *      member: WITHDRAW EARNINGS           Withdrawing functions, there's many: normal, agent, donate
 *      admin: DEPLOY AND SETUP DATA UNION  Functions for deploying the contract and adding secrets for smooth joining
 *      admin: MANAGE DATA UNION            Kick and add members
 */

import fetch from 'node-fetch'
import {
    Contract,
    ContractFactory,
    Wallet,
    getDefaultProvider,
    providers,
    utils as ethersUtils,
} from 'ethers'
import debugFactory from 'debug'

import * as DataUnion from '../../contracts/DataUnion.json'

import authFetch, { DEFAULT_HEADERS } from './authFetch'

const { BigNumber, computeAddress, getAddress } = ethersUtils

const debug = debugFactory('StreamrClient::DataUnionEndpoints')

/** @typedef {String} EthereumAddress */

function throwIfBadAddress(address, variableDescription) {
    try {
        return getAddress(address)
    } catch (e) {
        throw new Error(`${variableDescription || 'Error'}: Bad Ethereum address ${address}. Original error: ${e.stack}.`)
    }
}

async function throwIfNotContract(eth, address, variableDescription) {
    const addr = throwIfBadAddress(address, variableDescription)
    if (await eth.getCode(address) === '0x') {
        throw new Error(`${variableDescription || 'Error'}: No contract at ${address}`)
    }
    return addr
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function get(client, dataUnionContractAddress, endpoint, opts = {}) {
    const url = `${client.options.restUrl}/communities/${dataUnionContractAddress}${endpoint}`
    const response = await fetch(url, {
        ...opts,
        headers: {
            ...DEFAULT_HEADERS,
            ...opts.headers,
        },
    })
    const json = await response.json()
    // server may return things like { code: "ConnectionPoolTimeoutException", message: "Timeout waiting for connection from pool" }
    //   they must still be handled as errors
    if (!response.ok && !json.error) {
        json.error = `Server returned ${response.status} ${response.statusText}`
    }

    if (json.code && !json.error) {
        json.error = json.code
    }
    return json
}

async function getOrThrow(...args) {
    const res = await get(...args)
    if (res.error) {
        throw new Error(JSON.stringify(res))
    }
    return res
}

/**
 * @typedef {Object} EthereumOptions all optional, hence "options"
 * @property {Wallet | String} wallet or private key, default is currently logged in StreamrClient (if auth: privateKey)
 * @property {String} key private key, alias for String wallet
 * @property {String} privateKey, alias for String wallet
 * @property {providers.Provider} provider to use in case wallet was a String, or omitted
 * @property {Number} confirmations, default is 1
 * @property {BigNumber} gasPrice in wei (part of ethers overrides), default is whatever the network recommends (ethers.js default)
 * @see https://docs.ethers.io/ethers.js/html/api-contract.html#overrides
 */

// TODO: gasPrice to overrides (not needed for browser, but would be useful in node.js)

/**
 * Get a wallet from options, e.g. by parsing something that looks like a private key
 * @param {StreamrClient} client this
 * @param {EthereumOptions} options includes wallet which is Wallet or private key, or provider so StreamrClient auth: privateKey will be used
 * @returns {Wallet} "wallet with provider" that can be used to sign and send transactions
 */
function parseWalletFromOptions(client, options) {
    if (options.wallet instanceof Wallet) { return options.wallet }

    const key = typeof options.wallet === 'string' ? options.wallet : options.key || options.privateKey || client.options.auth.privateKey
    if (key) {
        const provider = options.provider instanceof providers.Provider ? options.provider : getDefaultProvider()
        return new Wallet(key, provider)
    }

    // TODO: check metamask before erroring!
    throw new Error("Please provide options.wallet, or options.privateKey string, if you're not authenticated using a privateKey")
}

// //////////////////////////////////////////////////////////////////
//          admin: DEPLOY AND SETUP DATA UNION
// //////////////////////////////////////////////////////////////////

/**
 * Deploy a new DataUnion contract and create the required joinPartStream
 * Note that the Promise resolves with an ethers.js TransactionResponse, so it's only sent to the chain at that point, but not yet deployed
 * @param {EthereumOptions} options such as blockFreezePeriodSeconds (default: 0), adminFee (default: 0)
 * @return {Promise<Contract>} has methods that can be awaited: contract is deployed (`.deployed()`), operator is started (`.isReady()`)
 */
export async function deployDataUnion(options) {
    const wallet = parseWalletFromOptions(this, options)
    const {
        blockFreezePeriodSeconds = 0,
        adminFee = 0,
        tokenAddress = this.options.tokenAddress,
        streamrNodeAddress = this.options.streamrNodeAddress,
        streamrOperatorAddress = this.options.streamrOperatorAddress
    } = options

    await throwIfNotContract(wallet.provider, tokenAddress, 'options.tokenAddress')
    await throwIfBadAddress(streamrNodeAddress, 'options.streamrNodeAddress')
    await throwIfBadAddress(streamrOperatorAddress, 'options.streamrOperatorAddress')

    if (adminFee < 0 || adminFee > 1) { throw new Error('options.adminFeeFraction must be a number between 0...1, got: ' + adminFee) }
    const adminFeeBN = new BigNumber((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

    const stream = await this.createStream({
        name: `Join-Part-${wallet.address.slice(0, 10)}-${Date.now()}`
    })
    debug(`Stream created: ${JSON.stringify(stream.toObject())}`)

    let res
    res = await stream.grantPermission('stream_get', null)
    debug(`Grant stream_get permission response from server: ${JSON.stringify(res)}`)
    res = await stream.grantPermission('stream_subscribe', null)
    debug(`Grant stream_subscribe permission response from server: ${JSON.stringify(res)}`)
    res = await stream.grantPermission('stream_get', streamrNodeAddress)
    debug(`Grant stream_get permission response to ${streamrNodeAddress} from server: ${JSON.stringify(res)}`)
    res = await stream.grantPermission('stream_publish', streamrNodeAddress)
    debug(`Grant stream_publish permission response to ${streamrNodeAddress} from server: ${JSON.stringify(res)}`)

    const deployer = new ContractFactory(DataUnion.abi, DataUnion.bytecode, wallet)
    const result = await deployer.deploy(streamrOperatorAddress, stream.id, tokenAddress, blockFreezePeriodSeconds, adminFeeBN)
    const { address } = result // this can be known in advance
    debug(`Data Union contract @ ${address} deployment started`)

    // add the waiting method so that caller can await data union being operated by server (so that EE calls work)
    const client = this
    result.isReady = async (pollingIntervalMs, timeoutMs) => client.dataUnionIsReady(address, pollingIntervalMs, timeoutMs)
    return result
}

/**
 * Await this function when you want to make sure a data union is deployed and ready to use
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if data union is ready
 * @param {Number} retryTimeoutMs (optional, default: 60000) give up sending more retries
 * @return {Promise} resolves when data union server is ready to operate the data union (or fails with HTTP error)
 */
export async function dataUnionIsReady(dataUnionContractAddress, pollingIntervalMs = 1000, retryTimeoutMs = 60000) {
    let stats = await get(this, dataUnionContractAddress, '/stats')
    const startTime = Date.now()
    while (stats.error && Date.now() < startTime + retryTimeoutMs && (!stats.dataUnion || stats.dataUnion.state !== 'failed')) {
        debug(`Waiting for data union ${dataUnionContractAddress} to start. Status: ${JSON.stringify(stats)}`)
        await sleep(pollingIntervalMs) // eslint-disable-line no-await-in-loop
        stats = await get(this, dataUnionContractAddress, '/stats') // eslint-disable-line no-await-in-loop
    }
    if (stats.error) {
        throw new Error(`Data Union failed to start, retried for ${retryTimeoutMs} ms. Status: ${JSON.stringify(stats)}`)
    }
}

/**
 * Add a new data union secret
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {String} secret password that can be used to join the data union without manual verification
 * @param {String} name describes the secret
 */
export async function createSecret(dataUnionContractAddress, secret, name = 'Untitled Data Union Secret') {
    const url = `${this.options.restUrl}/communities/${dataUnionContractAddress}/secrets`
    return authFetch(
        url,
        this.session,
        {
            method: 'POST',
            body: JSON.stringify({
                name,
                secret,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
}

// //////////////////////////////////////////////////////////////////
//          member: JOIN & QUERY DATA UNION
// //////////////////////////////////////////////////////////////////

/**
 * Send a joinRequest, or get into data union instantly with a data union secret
 * @param {EthereumAddress} dataUnionContractAddress to join
 * @param {String} secret (optional) if given, and correct, join the data union immediately
 */
export async function joinDataUnion(dataUnionContractAddress, secret) {
    const authKey = this.options.auth && this.options.auth.privateKey
    if (!authKey) {
        throw new Error('joinDataUnion: StreamrClient must have auth: privateKey')
    }

    const body = {
        memberAddress: computeAddress(authKey)
    }
    if (secret) { body.secret = secret }

    const url = `${this.options.restUrl}/communities/${dataUnionContractAddress}/joinRequests`
    return authFetch(
        url,
        this.session,
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
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumAddress} memberAddress (optional, default is StreamrClient's auth: privateKey)
 * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if member is in
 * @param {Number} retryTimeoutMs (optional, default: 60000) give up
 * @return {Promise} resolves when member is in the data union (or fails with HTTP error)
 */
export async function hasJoined(dataUnionContractAddress, memberAddress, pollingIntervalMs = 1000, retryTimeoutMs = 60000) {
    let address = memberAddress
    if (!address) {
        const authKey = this.options.auth && this.options.auth.privateKey
        if (!authKey) {
            throw new Error("StreamrClient wasn't authenticated with privateKey, and memberAddress argument not supplied")
        }
        address = computeAddress(authKey)
    }

    let stats = await get(this, dataUnionContractAddress, `/members/${address}`)
    const startTime = Date.now()
    while (stats.error && Date.now() < startTime + retryTimeoutMs && (!stats.dataUnion || stats.dataUnion.state !== 'failed')) {
        debug(`Waiting for member ${address} to be accepted into data union ${dataUnionContractAddress}. Status: ${JSON.stringify(stats)}`)
        await sleep(pollingIntervalMs) // eslint-disable-line no-await-in-loop
        stats = await get(this, dataUnionContractAddress, `/members/${address}`) // eslint-disable-line no-await-in-loop
    }
    if (stats.error) {
        throw new Error(`Member failed to join, retried for ${retryTimeoutMs} ms. Status: ${JSON.stringify(stats)}`)
    }
}

/**
 * Get stats of a single data union member, including proof
 * @param {EthereumAddress} dataUnionContractAddress to query
 * @param {EthereumAddress} memberAddress (optional) if not supplied, get the stats of currently logged in StreamrClient (if auth: privateKey)
 */
export async function getMemberStats(dataUnionContractAddress, memberAddress) {
    let address = memberAddress
    if (!address) {
        const authKey = this.options.auth && this.options.auth.privateKey
        if (!authKey) {
            throw new Error("StreamrClient wasn't authenticated with privateKey, and memberAddress argument not supplied")
        }
        address = computeAddress(authKey)
    }

    return getOrThrow(this, dataUnionContractAddress, `/members/${address}`)
}

/**
 * @typedef {Object} BalanceResponse
 * @property {BigNumber} total tokens earned less withdrawn previously, what you'd get once Operator commits the earnings to DataUnion contract
 * @property {BigNumber} withdrawable number of tokens that you'd get if you withdraw now
 */

/**
 * Calculate the amount of tokens the member would get from a successful withdraw
 * @param dataUnionContractAddress
 * @param memberAddress
 * @return {Promise<BalanceResponse>} earnings minus withdrawn tokens
 */
export async function getBalance(dataUnionContractAddress, memberAddress, provider) {
    let address = memberAddress
    if (!address) {
        const authKey = this.options.auth && this.options.auth.privateKey
        if (!authKey) {
            throw new Error("StreamrClient wasn't authenticated with privateKey, and memberAddress argument not supplied")
        }
        address = computeAddress(authKey)
    }

    const stats = await get(this, dataUnionContractAddress, `/members/${address}`)
    if (stats.error || stats.earnings === '0') {
        return {
            total: BigNumber.ZERO, withdrawable: BigNumber.ZERO
        }
    }
    const earningsBN = new BigNumber(stats.earnings)

    if (stats.withdrawableEarnings === '0') {
        return {
            total: earningsBN, withdrawable: BigNumber.ZERO
        }
    }
    const withdrawableEarningsBN = new BigNumber(stats.withdrawableEarnings)

    const dataUnionContract = new Contract(dataUnionContractAddress, DataUnion.abi, provider || getDefaultProvider())
    const withdrawnBN = await dataUnionContract.withdrawn(address)
    const total = earningsBN.sub(withdrawnBN)
    const withdrawable = withdrawableEarningsBN.sub(withdrawnBN)
    return {
        total, withdrawable
    }
}

// TODO: filter? That JSON blob could be big
export async function getMembers(dataUnionContractAddress) {
    return getOrThrow(this, dataUnionContractAddress, '/members')
}

export async function getDataUnionStats(dataUnionContractAddress) {
    return getOrThrow(this, dataUnionContractAddress, '/stats')
}

// //////////////////////////////////////////////////////////////////
//          member: WITHDRAW EARNINGS
// //////////////////////////////////////////////////////////////////

/* eslint-disable no-await-in-loop, no-else-return */
/**
 * Validate the proof given by the server with the smart contract (ground truth)
 * Wait for options.retryBlocks Ethereum blocks (default: 5)
 * @param {EthereumAddress} dataUnionContractAddress to query
 * @param {EthereumAddress} memberAddress to query
 * @param {providers.Provider} provider (optional) e.g. `wallet.provider`, default is `ethers.getDefaultProvider()` (mainnet)
 * @return {Object} containing the validated proof, withdrawableEarnings and withdrawableBlock
 */
export async function validateProof(dataUnionContractAddress, options) {
    const wallet = parseWalletFromOptions(this, options)
    const contract = new Contract(dataUnionContractAddress, DataUnion.abi, wallet)

    const { retryBlocks = 5 } = options
    for (let retryCount = 0; retryCount < retryBlocks; retryCount++) {
        const stats = await this.getMemberStats(dataUnionContractAddress, wallet.address) // throws on connection errors
        if (!stats.withdrawableBlockNumber) {
            throw new Error('No earnings to withdraw.')
        }
        const wasCorrect = await contract.proofIsCorrect(
            stats.withdrawableBlockNumber,
            wallet.address,
            stats.withdrawableEarnings,
            stats.proof,
        ).catch((e) => e)
        if (wasCorrect === true) {
            return stats
        } else if (wasCorrect === false) {
            console.error(`Server gave bad proof: ${JSON.stringify(stats)}`)
        } else if (wasCorrect instanceof Error && wasCorrect.message.endsWith('error_blockNotFound')) {
            // commit hasn't been yet accepted into blockchain, just wait until next block and try again
        } else {
            console.error(`Unexpected: ${wasCorrect}`)
        }
        await new Promise((done) => {
            wallet.provider.once('block', done)
        })
    }
    throw new Error(`Failed to validate proof after ${retryBlocks} Ethereum blocks`)
}
/* eslint-enable no-await-in-loop, no-else-return */

/**
 * Withdraw all your earnings
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdraw(dataUnionContractAddress, options) {
    const tx = await this.getWithdrawTx(dataUnionContractAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Get the tx promise for withdrawing all your earnings
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTx(dataUnionContractAddress, options) {
    const wallet = parseWalletFromOptions(this, options)
    const stats = await this.getMemberStats(dataUnionContractAddress, wallet.address) // throws on connection errors
    if (!stats.withdrawableBlockNumber) {
        throw new Error(`No earnings to withdraw. Server response: ${JSON.stringify(stats)}`)
    }
    const contract = new Contract(dataUnionContractAddress, DataUnion.abi, wallet)
    return contract.withdrawAll(stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
}

/**
 * Withdraw earnings (pay gas) on behalf of another member
 * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawFor(memberAddress, dataUnionContractAddress, options) {
    const tx = await this.getWithdrawTxFor(memberAddress, dataUnionContractAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Get the tx promise for withdrawing all earnings on behalf of another member
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTxFor(memberAddress, dataUnionContractAddress, options) {
    const stats = await this.getMemberStats(dataUnionContractAddress, memberAddress) // throws on connection errors
    if (!stats.withdrawableBlockNumber) {
        throw new Error(`No earnings to withdraw. Server response: ${JSON.stringify(stats)}`)
    }
    const wallet = parseWalletFromOptions(this, options)
    const contract = new Contract(dataUnionContractAddress, DataUnion.abi, wallet)
    return contract.withdrawAllFor(memberAddress, stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumAddress} recipientAddress the address to receive the tokens
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawTo(recipientAddress, dataUnionContractAddress, options) {
    const tx = await this.getWithdrawTxTo(recipientAddress, dataUnionContractAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {EthereumAddress} recipientAddress the address to receive the tokens
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTxTo(recipientAddress, dataUnionContractAddress, options) {
    const wallet = parseWalletFromOptions(this, options)
    const stats = await this.getMemberStats(dataUnionContractAddress, wallet.address) // throws on connection errors
    if (!stats.withdrawableBlockNumber) {
        throw new Error(`No earnings to withdraw. Server response: ${JSON.stringify(stats)}`)
    }
    const contract = new Contract(dataUnionContractAddress, DataUnion.abi, wallet)
    return contract.withdrawAllTo(recipientAddress, stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof, options)
}

// //////////////////////////////////////////////////////////////////
//          admin: MANAGE DATA UNION
// //////////////////////////////////////////////////////////////////

/**
 * Directly poke into joinPartStream, circumventing EE joinRequest tools etc.
 * Obviously requires write access to the stream, so only available to admins
 * TODO: find a way to check that the join/part has gone through and been registered by the server
 */
async function sendToJoinPartStream(client, type, dataUnionContractAddress, addresses, provider) {
    const contract = new Contract(dataUnionContractAddress, DataUnion.abi, provider || getDefaultProvider())
    const joinPartStreamId = await contract.joinPartStream()
    return client.publish(joinPartStreamId, {
        type, addresses,
    })
}

/**
 * Kick given members from data union
 * @param {EthereumAddress} dataUnionContractAddress to manage
 * @param {List<EthereumAddress>} memberAddressList to kick
 * @param {providers.Provider} provider (optional) default is mainnet
 */
export async function kick(dataUnionContractAddress, memberAddressList, provider) {
    return sendToJoinPartStream(this, 'part', dataUnionContractAddress, memberAddressList, provider)
}

/**
 * Add given Ethereum addresses as data union members
 * @param {EthereumAddress} dataUnionContractAddress to manage
 * @param {List<EthereumAddress>} memberAddressList to kick
 * @param {providers.Provider} provider (optional) default is mainnet
 */
export async function addMembers(dataUnionContractAddress, memberAddressList, provider) {
    return sendToJoinPartStream(this, 'join', dataUnionContractAddress, memberAddressList, provider)
}
