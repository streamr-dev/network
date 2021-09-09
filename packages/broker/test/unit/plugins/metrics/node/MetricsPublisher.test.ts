import { StreamrClient, ConfigTest, Stream } from 'streamr-client'
import { MetricsPublisher } from '../../../../../src/plugins/metrics/node/MetricsPublisher'

describe('MetricsPublisher', () => {
    let publisher: MetricsPublisher
    let mockStream: Stream

    beforeAll(() => {
        const nodeAddress = '0x1111111111111111111111111111111111111111'
        const storageNodeAddress = '0x2222222222222222222222222222222222222222'
        const client = new StreamrClient({
            ...ConfigTest,
            nodeRegistry: [{
                address: storageNodeAddress,
                url: 'http://storage.mock',
            }]
        })

        publisher = new MetricsPublisher(nodeAddress, client, storageNodeAddress)
        mockStream = {
            addToStorageNode: jest.fn(),
            grantPermission: jest.fn()
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

    it('ensure streams created: happy path', async () => {
        await publisher.ensureStreamsCreated()
        expect(getClient().getOrCreateStream).toBeCalledTimes(4)
        expect(mockStream.addToStorageNode).toBeCalledTimes(3)
        expect(mockStream.grantPermission).toBeCalledTimes(8)
    })
})
