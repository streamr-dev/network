import StreamrClient from 'streamr-client'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'
import { PublishConnection } from '../../../../src/plugins/websocket/PublishConnection'

const MOCK_STREAM_ID = 'streamId'
const MOCK_CONTENT1 = {
    foo: 1
}
const MOCK_CONTENT2 = {
    foo: 2
}

const createConnection = (streamrClient: Pick<StreamrClient, 'publish'>): (payload: string) => void => {
    let onWebsocketMessage: (payload: string) => void | undefined
    const connection = new PublishConnection(MOCK_STREAM_ID, {})
    const mockWebSocket = {
        on: (_event: 'message', listener: (payload: string) => void) => {
            onWebsocketMessage = listener
        }
    }
    connection.init(mockWebSocket as any, streamrClient as any, new PlainPayloadFormat())
    return onWebsocketMessage!
}

describe('PublishConnection', () => {

    let mockStreamrClient: Pick<StreamrClient, 'publish'>
    
    beforeEach(() => {
        mockStreamrClient = {
            publish: jest.fn()
        }
    })

    it('msgChainId constant between publish calls', () => {
        const onWebsocketMessage = createConnection(mockStreamrClient)
        onWebsocketMessage(JSON.stringify(MOCK_CONTENT1))
        onWebsocketMessage(JSON.stringify(MOCK_CONTENT2))
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(1, { id: MOCK_STREAM_ID }, MOCK_CONTENT1, { msgChainId: expect.any(String) })
        const firstMessageMsgChainId = (mockStreamrClient.publish as any).mock.calls[0][2].msgChainId
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(2, { id: MOCK_STREAM_ID }, MOCK_CONTENT2, { msgChainId: firstMessageMsgChainId })
    })

    it('msgChainId different for each connection', () => {
        const onWebsocketMessage1 = createConnection(mockStreamrClient)
        const onWebsocketMessage2 = createConnection(mockStreamrClient)
        onWebsocketMessage1(JSON.stringify(MOCK_CONTENT1))
        onWebsocketMessage2(JSON.stringify(MOCK_CONTENT2))
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(1, { id: MOCK_STREAM_ID }, MOCK_CONTENT1, { msgChainId: expect.any(String) })
        expect(mockStreamrClient.publish).toHaveBeenNthCalledWith(2, { id: MOCK_STREAM_ID }, MOCK_CONTENT2, { msgChainId: expect.any(String) })
        const firstMessageMsgChainId = (mockStreamrClient.publish as any).mock.calls[0][2].msgChainId
        const secondMessageMsgChainId = (mockStreamrClient.publish as any).mock.calls[1][2].msgChainId
        expect(firstMessageMsgChainId).not.toBe(secondMessageMsgChainId)
    })
})