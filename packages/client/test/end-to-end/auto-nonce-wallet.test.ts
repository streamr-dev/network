import { JsonRpcProvider, Contract } from 'ethers'

import { config } from '@streamr/config'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'

import { mockLoggerFactory } from '../test-utils/utils'

import { AutoNonceWallet } from '../../src/utils/AutoNonceWallet'
import { createDecoratedContract } from '../../src/utils/contract'

import streamRegistryAbi from '../../src/ethereumArtifacts/StreamRegistryV4Abi.json'
import type { StreamRegistryV4 as StreamRegistryContract } from '../../src/ethereumArtifacts/StreamRegistryV4'

const {
    contracts: {
        StreamRegistry: streamRegistryAddress,
    },
    rpcEndpoints: [{
        url: rpcUrl
    }],
} = config.dev2

const provider = new JsonRpcProvider(rpcUrl)

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('AutoNonceWallet', () => {
    it('should not get nonce conflicts when sending many transactions rapidly', async () => {
        const wallet = new AutoNonceWallet(await fetchPrivateKeyWithGas(), provider)
        const streamRegistry = new Contract(streamRegistryAddress, streamRegistryAbi, wallet) as unknown as StreamRegistryContract
        const tx1 = await streamRegistry.createStream(`/test1-${Date.now()}`, JSON.stringify({ partitions: 2, description: 'foo' }))
        const tx2 = await streamRegistry.createStream(`/test2-${Date.now()}`, JSON.stringify({ partitions: 2, description: 'foo' }))
        const tx3 = await streamRegistry.createStream(`/test3-${Date.now()}`, JSON.stringify({ partitions: 2, description: 'foo' }))
        await tx1.wait()
        await tx2.wait()
        await tx3.wait()
    })

    it('should tolerate several wallets using same private key, not sending transactions at the same time', async () => {
        const privateKey = await fetchPrivateKeyWithGas()
        const wallet1 = new AutoNonceWallet(privateKey, provider)
        const wallet2 = new AutoNonceWallet(privateKey, provider)
        const streamRegistry1 = createDecoratedContract<StreamRegistryContract>(
            new Contract(streamRegistryAddress, streamRegistryAbi, wallet1),
            'StreamRegistry',
            mockLoggerFactory(),
            1
        )
        const streamRegistry2 = createDecoratedContract<StreamRegistryContract>(
            new Contract(streamRegistryAddress, streamRegistryAbi, wallet2),
            'StreamRegistry',
            mockLoggerFactory(),
            1
        )
        // uses nonce X
        const tx1 = await streamRegistry1.createStream(`/test1_1-${Date.now()}`, JSON.stringify({ partitions: 2, description: 'foo' }))
        await tx1.wait()
        await sleep(100)
        // uses nonce X + 1
        const tx2 = await streamRegistry2.createStream(`/test2_1-${Date.now()}`, JSON.stringify({ partitions: 2, description: 'foo' }))
        await tx2.wait()
        await sleep(100)
        // tries to re-use nonce X + 1
        const tx1_2 = await streamRegistry1.createStream(`/test1_2-${Date.now()}`, JSON.stringify({ partitions: 2, description: 'foo' }))
        await tx1_2.wait()
    }, 20000)
})
