import 'reflect-metadata'

import { config as CHAIN_CONFIG } from '@streamr/config'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { createDecoratedContract } from '../../src/contracts/contract'
import type { StreamRegistryV5 as StreamRegistryContract } from '../../src/ethereumArtifacts/StreamRegistryV5'
import StreamRegistryArtifact from '../../src/ethereumArtifacts/StreamRegistryV5Abi.json'
import { mockLoggerFactory } from '../test-utils/utils'

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

const getProvider = () => new JsonRpcProvider(TEST_CHAIN_CONFIG.rpcEndpoints[0].url)

describe('decorated contract', () => {
    it('read', async () => {
        const contract = createDecoratedContract<StreamRegistryContract>(
            new Contract(
                toEthereumAddress(TEST_CHAIN_CONFIG.contracts.StreamRegistry),
                StreamRegistryArtifact,
                getProvider()
            ),
            'StreamRegisty',
            mockLoggerFactory(),
            1
        )
        const metadata = JSON.parse(
            await contract.getStreamMetadata('0xde1112f631486cfc759a50196853011528bc5fa0/assignments')
        )
        expect(metadata).toEqual({
            partitions: 1
        })
    })

    it('write', async () => {
        const wallet = new Wallet(await fetchPrivateKeyWithGas(), getProvider())
        const contract = createDecoratedContract<StreamRegistryContract>(
            new Contract(toEthereumAddress(TEST_CHAIN_CONFIG.contracts.StreamRegistry), StreamRegistryArtifact, wallet),
            'StreamRegisty',
            mockLoggerFactory(),
            1
        )
        const onTransactionConfirmed = jest.fn()
        contract.eventEmitter.on('onTransactionConfirm', onTransactionConfirmed)
        const path = `/${Date.now()}`
        const tx = await contract.createStream(path, JSON.stringify({ partitions: 2, description: 'foo' }))
        await tx.wait()
        expect(onTransactionConfirmed).toHaveBeenCalledTimes(1)
        expect(onTransactionConfirmed.mock.calls[0][0]).toBe('StreamRegisty.createStream')
        expect(onTransactionConfirmed.mock.calls[0][1].blockNumber).toBeNumber()
        const streamId = `${wallet.address.toLowerCase()}${path}`
        expect(JSON.parse(await contract.getStreamMetadata(streamId))).toEqual({
            partitions: 2,
            description: 'foo'
        })
    })
})
