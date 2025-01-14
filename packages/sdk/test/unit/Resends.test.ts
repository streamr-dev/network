import 'reflect-metadata'

import { isRunningInElectron, randomEthereumAddress, randomUserId, startTestServer } from '@streamr/test-utils'
import { StreamPartIDUtils, collect, hexToBinary, toLengthPrefixedFrame, toStreamID } from '@streamr/utils'
import range from 'lodash/range'
import { convertStreamMessageToBytes } from '../../src/protocol/oldStreamMessageBinaryUtils'
import { Resends } from '../../src/subscribe/Resends'
import { MOCK_CONTENT, mockLoggerFactory } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from './../../src/protocol/StreamMessage'

const createResends = (serverUrl: string) => {
    return new Resends(
        {
            getStorageNodeMetadata: async () => ({ urls: [serverUrl] })
        } as any,
        undefined as any,
        undefined as any,
        mockLoggerFactory()
    )
}

describe('Resends', () => {
    it('error response', async () => {
        const server = await startTestServer(
            '/streams/:streamId/data/partitions/:partition/:resendType',
            async (_req, res) => {
                res.status(400).json({
                    error: 'Mock error'
                })
            }
        )
        const resends = createResends(server.url)
        const requestUrl = `${server.url}/streams/stream/data/partitions/0/last?count=1&format=raw`
        await expect(async () => {
            const messages = await resends.resend(
                StreamPartIDUtils.parse('stream#0'),
                { last: 1, raw: true },
                async () => [randomEthereumAddress()]
            )
            await collect(messages)
        }).rejects.toThrowStreamrClientError({
            message: `Storage node fetch failed: Mock error, httpStatus=400, url=${requestUrl}`,
            code: 'STORAGE_NODE_ERROR'
        })
        await server.stop()
    })

    it('invalid server url', async () => {
        const resends = createResends('http://mock.test')
        await expect(async () => {
            const messages = await resends.resend(
                StreamPartIDUtils.parse('stream#0'),
                { last: 1, raw: true },
                async () => [randomEthereumAddress()]
            )
            await collect(messages)
        }).rejects.toThrowStreamrClientError({
            message: isRunningInElectron() ? 'Failed to fetch' : 'fetch failed (code=STORAGE_NODE_ERROR)',
            code: 'STORAGE_NODE_ERROR'
        })
    })

    it('large response', async () => {
        // larger than PuhsBuffer DEFAULT_BUFFER_SIZE
        const MESSAGE_COUNT = 257
        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const server = await startTestServer(
            '/streams/:streamId/data/partitions/:partition/:resendType',
            async (_req, res) => {
                const publisherId = randomUserId()
                for (const _ of range(MESSAGE_COUNT)) {
                    const msg = new StreamMessage({
                        messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, publisherId, ''),
                        content: MOCK_CONTENT,
                        signature: hexToBinary('0x1234'),
                        contentType: ContentType.JSON,
                        encryptionType: EncryptionType.NONE,
                        signatureType: SignatureType.SECP256K1
                    })
                    res.write(toLengthPrefixedFrame(convertStreamMessageToBytes(msg)))
                }
                res.end()
            }
        )
        const resends = createResends(server.url)
        const response = await resends.resend(streamPartId, { last: MESSAGE_COUNT, raw: true }, async () => [
            randomEthereumAddress()
        ])
        const messages = await collect(response)
        expect(messages.length).toBe(MESSAGE_COUNT)
        await server.stop()
    })
})
