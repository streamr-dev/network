import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { MAX_PARTITION_COUNT, StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { EthereumAddress, Logger, merge, wait, waitForCondition } from '@streamr/utils'
import crypto from 'crypto'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { mock } from 'jest-mock-extended'
import { AddressInfo } from 'net'
import { DependencyContainer } from 'tsyringe'
import { Authentication, createPrivateKeyAuthentication } from '../../src/Authentication'
import { StreamrClientConfig } from '../../src/Config'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { DestroySignal } from '../../src/DestroySignal'
import { PersistenceManager } from '../../src/PersistenceManager'
import { Stream, StreamMetadata } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LitProtocolFacade } from '../../src/encryption/LitProtocolFacade'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'
import { GroupKeyQueue } from '../../src/publish/GroupKeyQueue'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { StreamRegistryCached } from '../../src/registry/StreamRegistryCached'
import { LoggerFactory } from '../../src/utils/LoggerFactory'
import { counterId } from '../../src/utils/utils'
import { addAfterFn } from './jest-utils'

const logger = new Logger(module)

export function mockLoggerFactory(clientId?: string): LoggerFactory {
    return new LoggerFactory({
        id: clientId ?? counterId('TestCtx'),
        logLevel: 'info'
    })
}

export const uid = (prefix?: string): string => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

const getTestName = (module: NodeModule): string => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

const randomTestRunId = process.pid != null ? process.pid : crypto.randomBytes(4).toString('hex')

export const createRelativeTestStreamId = (module: NodeModule, suffix?: string): string => {
    return counterId(`/test/${randomTestRunId}/${getTestName(module)}${(suffix !== undefined) ? '-' + suffix : ''}`, '-')
}

export const createTestStream = async (streamrClient: StreamrClient, module: NodeModule, props?: Partial<StreamMetadata>): Promise<Stream> => {
    const stream = await streamrClient.createStream({
        id: createRelativeTestStreamId(module),
        ...props
    })
    return stream
}

export const getCreateClient = (
    defaultOpts = {},
    defaultParentContainer?: DependencyContainer
): (opts?: StreamrClientConfig, parentContainer?: DependencyContainer) => Promise<StreamrClient> => {
    const addAfter = addAfterFn()

    return async function createClient(opts: any = {}, parentContainer?: DependencyContainer) {
        let key
        if (opts.auth && opts.auth.privateKey) {
            key = opts.auth.privateKey
        } else {
            key = await fetchPrivateKeyWithGas()
        }
        const client = new StreamrClient(merge(
            CONFIG_TEST,
            {
                auth: {
                    privateKey: key,
                }
            },
            defaultOpts,
            opts,
        ), defaultParentContainer ?? parentContainer)

        addAfter(async () => {
            await wait(0)
            if (!client) { return }
            logger.debug(`disconnecting after test >> (clientId=${client.id})`)
            await client.destroy()
            logger.debug(`disconnecting after test << (clientId=${client.id})`)
        })

        return client
    }
}

type CreateMockMessageOptions = {
    publisher: Wallet
    content?: any
    msgChainId?: string
    timestamp?: number
    encryptionKey?: GroupKey
    nextEncryptionKey?: GroupKey
} & ({ streamPartId: StreamPartID, stream?: never } | { stream: Stream, streamPartId?: never })

export const createMockMessage = async (
    opts: CreateMockMessageOptions
): Promise<StreamMessage> => {
    const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(
        opts.streamPartId ?? opts.stream.getStreamParts()[0]
    )
    const authentication = createPrivateKeyAuthentication(opts.publisher.privateKey, undefined as any)
    const factory = new MessageFactory({
        authentication,
        streamId,
        streamRegistry: createStreamRegistryCached({
            partitionCount: MAX_PARTITION_COUNT,
            isPublicStream: (opts.encryptionKey === undefined),
            isStreamPublisher: true
        }),
        groupKeyQueue: await createGroupKeyQueue(authentication, opts.encryptionKey, opts.nextEncryptionKey)
    })
    const DEFAULT_CONTENT = {}
    const plainContent = opts.content ?? DEFAULT_CONTENT
    return factory.createMessage(plainContent, {
        timestamp: opts.timestamp ?? Date.now(),
        msgChainId: opts.msgChainId
    }, partition)
}

export const getLocalGroupKeyStore = (userAddress: EthereumAddress): LocalGroupKeyStore => {
    const authentication = {
        getAddress: () => userAddress
    } as any
    const loggerFactory = mockLoggerFactory()
    return new LocalGroupKeyStore(
        new PersistenceManager(
            authentication,
            new DestroySignal(),
            loggerFactory
        ),
        new StreamrClientEventEmitter(),
        loggerFactory
    )
}

export const startPublisherKeyExchangeSubscription = async (
    publisherClient: StreamrClient,
    streamPartId: StreamPartID): Promise<void> => {
    const node = await publisherClient.getNode()
    node.subscribe(streamPartId)
}

export const createRandomAuthentication = (): Authentication => {
    return createPrivateKeyAuthentication(`0x${fastPrivateKey()}`, undefined as any)
}

export const createStreamRegistryCached = (opts?: {
    partitionCount?: number
    isPublicStream?: boolean
    isStreamPublisher?: boolean
    isStreamSubscriber?: boolean
}): StreamRegistryCached => {
    return {
        getStream: async () => ({
            getMetadata: () => ({
                partitions: opts?.partitionCount ?? 1
            })
        }),
        isPublic: async () => {
            return opts?.isPublicStream ?? false
        },
        isStreamPublisher: async () => {
            return opts?.isStreamPublisher ?? true
        },
        isStreamSubscriber: async () => {
            return opts?.isStreamSubscriber ?? true
        },
    } as any
}

export const createGroupKeyManager = (
    groupKeyStore: LocalGroupKeyStore = mock<LocalGroupKeyStore>(),
    authentication = createRandomAuthentication()
): GroupKeyManager => {
    return new GroupKeyManager(
        mock<SubscriberKeyExchange>(),
        mock<LitProtocolFacade>(),
        groupKeyStore,
        {
            encryption: {
                litProtocolEnabled: false,
                litProtocolLogging: false,
                maxKeyRequestsPerSecond: 10,
                keyRequestTimeout: 50,
                // eslint-disable-next-line no-underscore-dangle
                rsaKeyLength: CONFIG_TEST.encryption!.rsaKeyLength!
            }
        },
        authentication,
        new StreamrClientEventEmitter(),
        new DestroySignal()
    )
}

export const createGroupKeyQueue = async (authentication: Authentication, current?: GroupKey, next?: GroupKey): Promise<GroupKeyQueue> => {
    const queue = await GroupKeyQueue.createInstance(
        undefined as any,
        authentication,
        createGroupKeyManager(undefined, authentication)
    )
    if (current !== undefined) {
        await queue.rekey(current)
    }
    if (next !== undefined) {
        await queue.rotate(next)
    }
    return queue
}

export const waitForCalls = async (mockFunction: jest.Mock<any>, n: number): Promise<void> => {
    await waitForCondition(() => mockFunction.mock.calls.length >= n, 1000, 10, undefined, () => {
        return `Timeout while waiting for calls: got ${mockFunction.mock.calls.length} out of ${n}`
    })
}

export const startTestServer = async (
    endpoint: string,
    onRequest: (req: Request, res: Response) => Promise<void>
): Promise<{ url: string, stop: () => Promise<void> }> => {
    const app = express()
    app.get(endpoint, async (req, res) => {
        await onRequest(req, res)
    })
    const server = app.listen()
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    return {
        url: `http://localhost:${port}`,
        stop: async () => {
            server.close()
            await once(server, 'close')
        }
    }
}
