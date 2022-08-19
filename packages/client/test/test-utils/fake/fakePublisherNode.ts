import { FakeNetworkNode } from './FakeNetworkNode'
import { addSubscriber, createMockMessage } from '../utils'
import {
    GroupKeyErrorResponse,
    GroupKeyRequest,
    GroupKeyRequestSerialized,
    KeyExchangeStreamIDUtils,
    StreamMessage
} from 'streamr-client-protocol'
import { GroupKey } from '../../../src/encryption/GroupKey'
import { createGroupKeyResponse } from '../../../src/encryption/PublisherKeyExchange'
import { Wallet } from '@ethersproject/wallet'
import { FakeEnvironment } from './FakeEnvironment'

const createGroupKeySuccessResponse = async (
    request: StreamMessage<GroupKeyRequestSerialized>,
    groupKeys: GroupKey[],
    publisherWallet: Wallet
): Promise<StreamMessage<any>> => {
    return createMockMessage({
        streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(request.getPublisherId()),
        publisher: publisherWallet,
        content: (await createGroupKeyResponse(
            request,
            async (groupKeyId: string) => groupKeys.find((key) => key.id === groupKeyId),
            async () => true
        )).serialize(),
        messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
        encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA
    })
}

const createGroupKeyErrorResponse = (
    errorCode: string,
    requestMessage: StreamMessage<GroupKeyRequestSerialized>,
    publisherWallet: Wallet,
): StreamMessage<any> => {
    const request = GroupKeyRequest.fromArray(requestMessage.getParsedContent())
    const { requestId, streamId, groupKeyIds } = request
    return createMockMessage({
        streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(requestMessage.getPublisherId()),
        publisher: publisherWallet,
        messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE,
        contentType: StreamMessage.CONTENT_TYPES.JSON,
        encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
        content: new GroupKeyErrorResponse({
            requestId,
            streamId,
            errorCode,
            errorMessage: '',
            groupKeyIds
        }).serialize(),
    })
}

export const startFakePublisherNode = async (
    publisherWallet: Wallet,
    groupKeys: GroupKey[],
    environment: FakeEnvironment,
    getError: (request: StreamMessage<GroupKeyRequestSerialized>) => Promise<string | undefined> = async () => undefined,
): Promise<FakeNetworkNode> => {
    const publisherNode = environment.startFakeNode(publisherWallet.address)
    const requests = addSubscriber<GroupKeyRequestSerialized>(publisherNode, KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))
    setImmediate(async () => {
        for await (const request of requests) {
            const errorCode = await getError(request)
            const response = (errorCode === undefined)
                ? await createGroupKeySuccessResponse(request, groupKeys, publisherWallet)
                : createGroupKeyErrorResponse(errorCode, request, publisherWallet)
            publisherNode.publish(response)
        }
    })
    return publisherNode
}
