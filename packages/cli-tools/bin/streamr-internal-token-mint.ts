#!/usr/bin/env node
import '../src/logLevel'

import { config as CHAIN_CONFIG } from '@streamr/config'
import { DATAv2ABI as DATATokenABI, DATAv2 as DATATokenContract } from '@streamr/network-contracts'
import { StreamrClient } from '@streamr/sdk'
import { Contract, parseEther, Provider, Wallet } from 'ethers'
import { createClientCommand } from '../src/command'

const SELF_TARGET_ADDRESS_ID = 'self'
const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

const getTestTokenContract = (): DATATokenContract => {
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, DATATokenABI) as unknown as DATATokenContract
}

const getTestAdminWallet = (provider: Provider): Wallet => {
    return new Wallet(TEST_CHAIN_CONFIG.adminPrivateKey, provider)
}

createClientCommand(async (client: StreamrClient, targetAddress: string, dataTokenAmount: string, gasAmount?: string) => {
    if (client.getConfig().environment !== 'dev2') {
        // adminPrivateKey is only available for "dev2" in the CHAIN_CONFIG
        console.error('only "dev2" environment is supported')
        process.exit(1)
    }
    if (targetAddress === SELF_TARGET_ADDRESS_ID) {
        targetAddress = await client.getUserId()
    }
    const adminWallet = getTestAdminWallet((await client.getSigner()).provider)
    const token = getTestTokenContract().connect(adminWallet)
    await (await token.mint(targetAddress, parseEther(dataTokenAmount))).wait()
    if (gasAmount !== undefined) {
        await (await adminWallet.sendTransaction({
            to: targetAddress,
            value: parseEther(gasAmount)
        })).wait()
    }
})
    .arguments('<targetAddress> <dataTokenAmount> [gasAmount]')
    .description('mint test tokens and optionally transfer gas to the given Ethereum address' +
        '\n\nNote: use keyword "self" as targetAddress to mint for the authenticated user')
    .parseAsync()
