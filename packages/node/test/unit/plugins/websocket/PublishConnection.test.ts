import { StreamrClient } from '@streamr/sdk'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'
import { PublishConnection } from '../../../../src/plugins/websocket/PublishConnection'
import { mock, MockProxy } from 'jest-mock-extended'

const MOCK_STREAM_ID = 'streamId'
const MOCK_CONTENT1 = {
    foo: 1
}
const MOCK_CONTENT2 = {
    foo: 2
}

const createConnection = async (streamrClient: StreamrClient): Promise<(payload: string) => void> => {
    let capturedOnMessageListener: (payload: string) => void
    const mockWebSocket = {
        on: (_event: 'message', listener: (payload: string) => void) => {
            capturedOnMessageListener = listener
        }
    }
    const connection = new PublishConnection(MOCK_STREAM_ID, {})
    await connection.init(mockWebSocket as any, 'socketId', streamrClient, new PlainPayloadFormat())
    return capturedOnMessageListener!
}

describe('PublishConnection', () => {
    let mockStreamrClient: MockProxy<StreamrClient>

    beforeEach(() => {
        mockStreamrClient = mock<StreamrClient>()
    })

    it('msgChainId constant between publish calls', async () => {
        const onWebsocketMessage = await createConnection(mockStreamrClient)
        onWebsocketMessage(JSON.stringify(MOCK_CONTENT1))
        onWebsocketMessage(JSON.stringify(MOCK_CONTENT2))
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(1, { id: MOCK_STREAM_ID }, MOCK_CONTENT1, {
            msgChainId: expect.any(String)
        })
        const firstMessageMsgChainId = (mockStreamrClient.publish as any).mock.calls[0][2].msgChainId
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(2, { id: MOCK_STREAM_ID }, MOCK_CONTENT2, {
            msgChainId: firstMessageMsgChainId
        })
    })

    it('msgChainId different for each connection', async () => {
        const onWebsocketMessage1 = await createConnection(mockStreamrClient)
        const onWebsocketMessage2 = await createConnection(mockStreamrClient)
        onWebsocketMessage1(JSON.stringify(MOCK_CONTENT1))
        onWebsocketMessage2(JSON.stringify(MOCK_CONTENT2))
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(1, { id: MOCK_STREAM_ID }, MOCK_CONTENT1, {
            msgChainId: expect.any(String)
        })
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(2, { id: MOCK_STREAM_ID }, MOCK_CONTENT2, {
            msgChainId: expect.any(String)
        })
        const firstMessageMsgChainId = (mockStreamrClient.publish as any).mock.calls[0][2].msgChainId
        const secondMessageMsgChainId = (mockStreamrClient.publish as any).mock.calls[1][2].msgChainId
        expect(firstMessageMsgChainId).not.toBe(secondMessageMsgChainId)
    })
})
