import { config as CHAIN_CONFIG } from '@streamr/config'
import { StreamRegistryABI, StreamRegistry as StreamRegistryContract } from '@streamr/network-contracts'
import { createTestPrivateKey, getTestProvider } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'
import { Contract, Wallet } from 'ethers'
import { createDecoratedContract } from '../../src/contracts/contract'
import { mockLoggerFactory } from '../test-utils/utils'

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

describe('decorated contract', () => {

    it('read', async () => {
        const contract = createDecoratedContract<StreamRegistryContract>(
            new Contract(toEthereumAddress(TEST_CHAIN_CONFIG.contracts.StreamRegistry), StreamRegistryABI, getTestProvider()),
            'StreamRegisty',
            mockLoggerFactory(),
            1
        )
        const metadata = JSON.parse(await contract.getStreamMetadata('0xde1112f631486cfc759a50196853011528bc5fa0/assignments'))
        expect(metadata).toEqual({
            partitions: 1
        })
    })

    it('write', async () => {
        const wallet = new Wallet(await createTestPrivateKey({ gas: true }), getTestProvider())
        const contract = createDecoratedContract<StreamRegistryContract>(
            new Contract(toEthereumAddress(TEST_CHAIN_CONFIG.contracts.StreamRegistry), StreamRegistryABI, wallet),
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
