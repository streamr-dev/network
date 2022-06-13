import { DependencyContainer } from 'tsyringe'
import { StreamRegistry } from '../../../src/StreamRegistry'
import { FakeBrubeckNode } from './FakeBrubeckNode'
import { createMockMessage } from '../utils'
import {
    EthereumAddress,
    GroupKeyErrorResponse,
    GroupKeyRequest,
    GroupKeyRequestSerialized,
    KeyExchangeStreamIDUtils,
    StreamID,
    StreamMessage
} from 'streamr-client-protocol'
import { GroupKey } from '../../../src/encryption/GroupKey'
import { createGroupKeyResponse } from '../../../src/encryption/PublisherKeyExchange'
import { Wallet } from '@ethersproject/wallet'
import { addFakeNode } from './fakeEnvironment'

const createGroupKeySuccessResponse = async (
    request: StreamMessage<GroupKeyRequestSerialized>,
    groupKeys: GroupKey[],
    publisherWallet: Wallet,
    streamRegistry: StreamRegistry
): Promise<StreamMessage<any>> => {
    return createMockMessage({
        streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(request.getPublisherId()),
        publisher: publisherWallet,
        content: (await createGroupKeyResponse(
            request,
            async (groupKeyId: string) => groupKeys.find((key) => key.id === groupKeyId),
            async (streamId: StreamID, ethAddress: EthereumAddress) => streamRegistry.isStreamSubscriber(streamId, ethAddress)
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

export const addFakePublisherNode = async (
    publisherWallet: Wallet,
    groupKeys: GroupKey[],
    dependencyContainer: DependencyContainer,
    getError: (request: StreamMessage<GroupKeyRequestSerialized>) => string | undefined = () => undefined
): Promise<FakeBrubeckNode> => {
    const publisherNode = addFakeNode(publisherWallet.address, dependencyContainer)
    const streamRegistry = dependencyContainer.resolve(StreamRegistry)
    const requests = publisherNode.addSubscriber<GroupKeyRequestSerialized>(KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))
    setImmediate(async () => {
        for await (const request of requests) {
            const errorCode = getError(request)
            const response = (errorCode === undefined)
                ? await createGroupKeySuccessResponse(request, groupKeys, publisherWallet, streamRegistry)
                : createGroupKeyErrorResponse(errorCode, request, publisherWallet)
            publisherNode.publishToNode(response)
        }
    })
    return publisherNode
}
