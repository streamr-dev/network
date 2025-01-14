import { EthereumAddress, StreamID, toStreamPartID, withTimeout } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { StrictStreamrClientConfig } from '../Config'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { StreamStorageRegistry } from '../contracts/StreamStorageRegistry'
import { DEFAULT_PARTITION } from '../StreamIDBuilder'
import { Subscriber } from '../subscribe/Subscriber'
import { Subscription, SubscriptionEvents } from '../subscribe/Subscription'
import { formStorageNodeAssignmentStreamId } from '../utils/utils'
import { waitForAssignmentsToPropagate } from '../utils/waitForAssignmentsToPropagate'
import { LoggerFactory } from './LoggerFactory'

export const addStreamToStorageNode = async (
    streamId: StreamID,
    storageNodeAddress: EthereumAddress,
    opts: { wait: boolean; timeout?: number },
    partitionCount: number,
    subscriber: Subscriber,
    streamRegistry: StreamRegistry,
    streamStorageRegistry: StreamStorageRegistry,
    loggerFactory: LoggerFactory,
    config: Pick<StrictStreamrClientConfig, '_timeouts'>
): Promise<void> => {
    if (opts.wait) {
        // check whether the stream is already stored: the assignment event listener logic requires that
        // there must not be an existing assignment (it timeouts if there is an existing assignment as the
        // storage node doesn't send an assignment event in that case)
        const isAlreadyStored = await streamStorageRegistry.isStoredStream(streamId, storageNodeAddress)
        if (isAlreadyStored) {
            return
        }
        let assignmentSubscription
        try {
            const streamPartId = toStreamPartID(
                formStorageNodeAssignmentStreamId(storageNodeAddress),
                DEFAULT_PARTITION
            )
            assignmentSubscription = new Subscription(
                streamPartId,
                false,
                undefined,
                new EventEmitter<SubscriptionEvents>(),
                loggerFactory
            )
            await subscriber.add(assignmentSubscription)
            const propagationPromise = waitForAssignmentsToPropagate(
                assignmentSubscription,
                {
                    id: streamId,
                    partitions: partitionCount
                },
                loggerFactory
            )
            await streamStorageRegistry.addStreamToStorageNode(streamId, storageNodeAddress)
            await withTimeout(
                propagationPromise,
                // eslint-disable-next-line no-underscore-dangle
                opts.timeout ?? config._timeouts.storageNode.timeout,
                'storage node did not respond'
            )
        } finally {
            streamRegistry.invalidatePermissionCaches(streamId)
            await assignmentSubscription?.unsubscribe() // should never reject...
        }
    } else {
        await streamStorageRegistry.addStreamToStorageNode(streamId, storageNodeAddress)
    }
}
