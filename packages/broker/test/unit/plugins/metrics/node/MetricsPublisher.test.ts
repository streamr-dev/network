import { StreamrClient, ConfigTest, Stream } from 'streamr-client'
import { MetricsPublisher } from '../../../../../src/plugins/metrics/node/MetricsPublisher'

describe('MetricsPublisher', () => {
    let publisher: MetricsPublisher
    let mockStream: Stream

    beforeEach(() => {
        const nodeAddress = '0x1111111111111111111111111111111111111111'
        const storageNodeAddress = '0x2222222222222222222222222222222222222222'
        const client = new StreamrClient({
            ...ConfigTest,
            storageNodeRegistry: {
                contractAddress: storageNodeAddress,
                jsonRpcProvider: 'http://storage.mock',
            }
        })

        publisher = new MetricsPublisher(nodeAddress, client, storageNodeAddress, `${nodeAddress}/metrics/node/firehose/`)
        mockStream = {
            addToStorageNode: jest.fn(),
            // grantPermission: jest.fn(),
            grantPublicPermission: jest.fn()
        } as any
        // @ts-expect-error private field
        publisher.client = {
            getOrCreateStream: jest.fn().mockReturnValue(mockStream)
        } as any
    })

    const getClient = () => {
        // @ts-expect-error private field
        return publisher.client
    }

    describe('ensure streams created', () => {

        it('happy path', async () => {
            await publisher.ensureStreamsCreated()
            expect(getClient().getOrCreateStream).toBeCalledTimes(4)
            expect(mockStream.grantPublicPermission).toBeCalledTimes(4)
            expect(mockStream.addToStorageNode).toBeCalledTimes(3)
        })

        it('storage assignment fails', async () => {
            mockStream.addToStorageNode = jest.fn().mockRejectedValue(new Error('mock-error'))
            try {
                await publisher.ensureStreamsCreated()
            } catch (e) {}
            expect(getClient().getOrCreateStream).toBeCalledTimes(4)
            expect(mockStream.grantPublicPermission).toBeCalledTimes(4)
        })

    })
})
