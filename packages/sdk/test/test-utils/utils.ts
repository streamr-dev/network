import {
    Operator as OperatorContract,
    Sponsorship as SponsorshipContract
} from '@streamr/network-contracts'
import { createTestPrivateKey } from '@streamr/test-utils'
import {
    DEFAULT_PARTITION_COUNT,
    Logger,
    MAX_PARTITION_COUNT,
    merge,
    StreamPartID,
    StreamPartIDUtils,
    until,
    UserID,
    utf8ToBinary,
    wait
} from '@streamr/utils'
import { randomBytes } from '@noble/post-quantum/utils'
import { id, Wallet } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { mock } from 'jest-mock-extended'
import { AddressInfo } from 'net'
import path from 'path'
import { DependencyContainer } from 'tsyringe'
import { Identity } from '../../src/identity/Identity'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { createStrictConfig } from '../../src/Config'
import type { StreamrClientConfig } from '../../src/ConfigTypes'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { DestroySignal } from '../../src/DestroySignal'
import { PersistenceManager } from '../../src/PersistenceManager'
import { Stream } from '../../src/Stream'
import { StreamMetadata } from '../../src/StreamMetadata'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import {
    deployOperatorContract,
    DeployOperatorContractOpts,
    deploySponsorshipContract,
    DeploySponsorshipContractOpts
} from '../../src/contracts/operatorContractUtils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'
import { StreamMessage } from '../../src/protocol/StreamMessage'
import { GroupKeyQueue } from '../../src/publish/GroupKeyQueue'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SigningService } from '../../src/signature/SigningService'
import { createSignatureFromData } from '../../src/signature/signingUtils'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { LoggerFactory } from '../../src/utils/LoggerFactory'
import { counterId } from '../../src/utils/utils'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from './../test-utils/fake/FakeStorageNode'
import { addAfterFn } from './jest-utils'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'

const logger = new Logger('sdk-test-utils')

/**
 * Creates a mock SigningService that performs signing synchronously on the main thread.
 * Use this in tests instead of the real SigningService which spawns a worker.
 */
export function createMockSigningService(): SigningService {
    return {
        sign: createSignatureFromData,
        destroy: () => {}
    } as unknown as SigningService
}

/**
 * Creates a MessageSigner for testing purposes.
 * Uses a mock SigningService that doesn't spawn a worker.
 */
export function createMessageSigner(identity: Identity): MessageSigner {
    return new MessageSigner(identity, createMockSigningService())
}

export function mockLoggerFactory(clientId?: string): LoggerFactory {
    return new LoggerFactory({
        id: clientId ?? counterId('TestCtx'),
        logLevel: 'info'
    })
}

export const uid = (prefix?: string): string => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

const getTestName = (module: NodeModule): string => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const moduleFilename = (module.filename ?? module.id) // browser has no filename
    const groups = moduleFilename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : moduleFilename
}

const randomTestRunId = process.pid ?? Buffer.from(randomBytes(4)).toString('hex')

export const createRelativeTestStreamId = (module: NodeModule, suffix?: string): string => {
    return counterId(`/test/${randomTestRunId}/${getTestName(module)}${(suffix !== undefined) ? '-' + suffix : ''}`, '-')
}

export const createTestStream = async (streamrClient: StreamrClient, module: NodeModule, props?: StreamMetadata): Promise<Stream> => {
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
        if (opts.auth?.privateKey) {
            key = opts.auth.privateKey
        } else {
            key = await createTestPrivateKey({ gas: true })
        }
        const client = new StreamrClient(merge<StreamrClientConfig>(
            {
                environment: 'dev2',
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
        opts.streamPartId ?? (await opts.stream.getStreamParts())[0]
    )
    const identity = EthereumKeyPairIdentity.fromPrivateKey(opts.publisher.privateKey)
    const factory = new MessageFactory({
        identity,
        config: createStrictConfig(CONFIG_TEST),
        streamId,
        streamRegistry: createStreamRegistry({
            partitionCount: MAX_PARTITION_COUNT,
            isPublicStream: (opts.encryptionKey === undefined),
            isStreamPublisher: true
        }),
        groupKeyQueue: await createGroupKeyQueue(identity, opts.encryptionKey, opts.nextEncryptionKey),
        signatureValidator: mock<SignatureValidator>(),
        messageSigner: createMessageSigner(identity)
    })
    const DEFAULT_CONTENT = {}
    const plainContent = opts.content ?? DEFAULT_CONTENT
    return factory.createMessage(plainContent, {
        timestamp: opts.timestamp ?? Date.now(),
        msgChainId: opts.msgChainId
    }, partition)
}

// When binary contents are supported we don't need this anymore.
export const MOCK_CONTENT = utf8ToBinary(JSON.stringify({}))

export const getLocalGroupKeyStore = (ownerId: UserID): LocalGroupKeyStore => {
    const identity = {
        getUserId: () => ownerId
    } as any
    const loggerFactory = mockLoggerFactory()
    return new LocalGroupKeyStore(
        new PersistenceManager(
            identity,
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
    const node = publisherClient.getNode()
    await node.join(streamPartId)
}

export const createRandomIdentity = async (): Promise<Identity> => {
    return EthereumKeyPairIdentity.fromPrivateKey(await createTestPrivateKey())
}

export const createStreamRegistry = (opts?: {
    partitionCount?: number
    isPublicStream?: boolean
    isStreamPublisher?: boolean
    isStreamSubscriber?: boolean
}): StreamRegistry => {
    return {
        getStreamMetadata: async () => ({
            partitions: opts?.partitionCount ?? DEFAULT_PARTITION_COUNT
        }),
        hasPublicSubscribePermission: async () => {
            return opts?.isPublicStream ?? false
        },
        isStreamPublisher: async () => {
            return opts?.isStreamPublisher ?? true
        },
        isStreamSubscriber: async () => {
            return opts?.isStreamSubscriber ?? true
        },
        invalidatePermissionCaches: () => {}
    } as any
}

export const createGroupKeyManager = async (
    identity: Identity,
    groupKeyStore: LocalGroupKeyStore = mock<LocalGroupKeyStore>()
): Promise<GroupKeyManager> => {
    return new GroupKeyManager(
        mock<SubscriberKeyExchange>(),
        groupKeyStore,
        new StreamIDBuilder(identity),
        {
            encryption: {
                maxKeyRequestsPerSecond: 10,
                keyRequestTimeout: 50,
                rsaKeyLength: CONFIG_TEST.encryption!.rsaKeyLength!,
                requireQuantumResistantKeyExchange: false,
                requireQuantumResistantSignatures: false,
                requireQuantumResistantEncryption: false,
                keys: undefined as any
            }
        },
        identity,
        new StreamrClientEventEmitter(),
        new DestroySignal(),
    )
}

export const createGroupKeyQueue = async (identity: Identity, current?: GroupKey, next?: GroupKey): Promise<GroupKeyQueue> => {
    const queue = await GroupKeyQueue.createInstance(
        undefined as any,
        identity,
        await createGroupKeyManager(identity)
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
    await until(() => mockFunction.mock.calls.length >= n, 1000, 10, undefined, () => {
        return `Timeout while waiting for calls: got ${mockFunction.mock.calls.length} out of ${n}`
    })
}

export const createTestClient = (privateKey?: string, wsPort?: number, acceptProxyConnections = false): StreamrClient => {
    return new StreamrClient({
        environment: 'dev2',
        auth: (privateKey !== undefined) ? { privateKey } : undefined,
        network: {
            controlLayer: {
                websocketPortRange: wsPort !== undefined ? { min: wsPort, max: wsPort } : undefined
            },
            node: {
                acceptProxyConnections
            }
        }
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
        url: `http://127.0.0.1:${port}`,
        stop: async () => {
            server.close()
            await once(server, 'close')
        }
    }
}

export const startFailingStorageNode = async (error: Error, environment: FakeEnvironment): Promise<FakeStorageNode> => {
    const node = new class extends FakeStorageNode {
        // eslint-disable-next-line class-methods-use-this, require-yield
        override async* getLast(): AsyncIterable<StreamMessage> {
            throw error
        }
        // eslint-disable-next-line class-methods-use-this, require-yield
        override async* getRange(): AsyncIterable<StreamMessage> {
            throw error
        }
    }(environment)
    await node.start()
    return node
}

/**
 * We can't read the file directly from the file system when running in the browser (Karma) environment.
 * Hence, we need to read the file indirectly via an Express server.
 */
export const readUtf8ExampleIndirectly = async (): Promise<string> => {
    return new Promise((resolve) => {
        const app = express()
        app.use('/static', express.static(path.join(__dirname, '/../data')))
        const server = app.listen(8134, async () => {
            const response = await fetch('http://localhost:8134/static/utf8.txt')
            const content = await response.text()
            server.close(() => {
                resolve(content)
            })
        })
    })
}

const ETHEREUM_FUNCTION_SELECTOR_LENGTH = 10  // 0x + 4 bytes

export const formEthereumFunctionSelector = (methodSignature: string): string => {
    return id(methodSignature).substring(0, ETHEREUM_FUNCTION_SELECTOR_LENGTH)
}

export const parseEthereumFunctionSelectorFromCallData = (data: string): string => {
    return data.substring(0, ETHEREUM_FUNCTION_SELECTOR_LENGTH)
}

export const deployTestOperatorContract = async (opts: Omit<DeployOperatorContractOpts, 'environmentId'>): Promise<OperatorContract> => {
    return deployOperatorContract({ ...opts, 'environmentId': 'dev2' })
}

export const deployTestSponsorshipContract = async (opts: Omit<DeploySponsorshipContractOpts, 'environmentId'>): Promise<SponsorshipContract> => {
    return deploySponsorshipContract({ ...opts, 'environmentId': 'dev2' })
}
