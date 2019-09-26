import fetch from 'node-fetch'
import {
    Contract,
    ContractFactory,
    utils,
} from 'ethers'

import * as CommunityProduct from '../../contracts/CommunityProduct.json'
import * as TestToken from '../../contracts/TestToken.json'

import authFetch from './authFetch'

export async function joinCommunity(communityAddress, memberAddress, secret = undefined) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/joinRequests`
    return authFetch(
        url,
        this.session,
        {
            method: 'POST',
            body: JSON.stringify({
                memberAddress,
                secret,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
}

export async function memberStats(communityAddress, memberAddress) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/members/${memberAddress}`
    return fetch(url).then((res) => res.json())
}

export async function withdraw(communityAddress, memberAddress, wallet, confirmations = 1) {
    const stats = await this.memberStats(communityAddress, memberAddress)
    if (!stats.withdrawableBlockNumber) {
        throw new Error('No earnings to withdraw.')
    }
    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    const withdrawTx = await contract.withdrawAll(stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
    const tokenAddress = await contract.token()
    const token = new Contract(tokenAddress, TestToken.abi, wallet)
    const receipt = await withdrawTx.wait(confirmations)
}

export async function communityStats(communityAddress) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/stats`
    return fetch(url).then((res) => res.json())
}

export async function createSecret(communityAddress, secret, name = 'Untitled Community Secret') {
    const url = `${this.options.restUrl}/communities/${communityAddress}/secrets`
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

function throwIfBadAddress(address, variableDescription) {
    try {
        return utils.getAddress(address)
    } catch (e) {
        throw new Error(`${variableDescription || 'Error'}: Bad Ethereum address ${address}`)
    }
}

async function throwIfNotContract(eth, address, variableDescription) {
    const addr = throwIfBadAddress(address, variableDescription)
    if (await eth.getCode(address) === '0x') {
        throw new Error(`${variableDescription || 'Error'}: No contract at ${address}`)
    }
    return addr
}

/**
 * Deploy a new CommunityProduct contract and create the required joinPartStream
 * @param {Wallet} wallet to do the deployment from, also becomes owner or stream and contract
 * @param {Number} blockFreezePeriodSeconds security parameter against operator failure (optional, default: 0)
 * @param {Number} adminFee fraction of revenue that goes to product admin, 0...1 (optional, default: 0)
 * @param {Function} logger will print debug info if given (optional)
 */
async function deployCommunity(wallet, blockFreezePeriodSeconds = 0, adminFee = 0, logger) {
    await throwIfNotContract(wallet.provider, this.options.tokenAddress, 'deployCommunity function argument tokenAddress')
    await throwIfBadAddress(this.options.streamrNodeAddress, 'StreamrClient option streamrNodeAddress')

    if (adminFee < 0 || adminFee > 1) { throw new Error('Admin fee must be a number between 0...1, got: ' + adminFee) }
    const adminFeeBN = new utils.BigNumber((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

    const stream = await this.getOrCreateStream({
        name: `Join-Part-${wallet.address.slice(0, 10)}-${Date.now()}`
    })
    const res1 = await stream.grantPermission('read', null)
    if (logger) { logger(`Grant read permission response from server: ${JSON.stringify(res1)}`) }
    const res2 = await stream.grantPermission('write', this.options.streamrNodeAddress)
    if (logger) { logger(`Grant write permission response to ${this.options.streamrNodeAddress} from server: ${JSON.stringify(res2)}`) }

    const deployer = new ContractFactory(CommunityProduct.abi, CommunityProduct.bytecode, wallet)
    const result = await deployer.deploy(this.options.streamrOperatorAddress, stream.id,
        this.options.tokenAddress, blockFreezePeriodSeconds, adminFeeBN)
    await result.deployed()
    return result
}
