import crypto from 'crypto'
import { DependencyContainer } from 'tsyringe'
import { fetchPrivateKeyWithGas } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import {
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils,
    EthereumAddress,
    MAX_PARTITION_COUNT
} from 'streamr-client-protocol'
import { sign } from '../../src/utils/signingUtils'
import { StreamrClient } from '../../src/StreamrClient'
import { counterId } from '../../src/utils/utils'
import { Debug } from '../../src/utils/log'
import { Stream, StreamProperties } from '../../src/Stream'
import { ConfigTest } from '../../src/ConfigTest'
import { padEnd } from 'lodash'
import { Context } from '../../src/utils/Context'
import { StreamrClientConfig } from '../../src/Config'
import { GroupKey } from '../../src/encryption/GroupKey'
import { addAfterFn } from './jest-utils'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { StreamrClientEventEmitter } from '../../src/events'
import { MessageFactory } from '../../src/publish/MessageFactory'

const testDebugRoot = Debug('test')
const testDebug = testDebugRoot.extend.bind(testDebugRoot)

export {
    testDebug as Debug
}

export function mockContext(): Context {
    const id = counterId('mockContext')
    return { id, debug: testDebugRoot.extend(id) }
}

export const uid = (prefix?: string): string => counterId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

// eslint-disable-next-line no-undef
const getTestName = (module: NodeModule): string => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

const randomTestRunId = process.pid != null ? process.pid : crypto.randomBytes(4).toString('hex')

export const createRelativeTestStreamId = (module: NodeModule, suffix?: string): string => {
    return counterId(`/test/${randomTestRunId}/${getTestName(module)}${(suffix !== undefined) ? '-' + suffix : ''}`, '-')
}

export const createTestStream = async (streamrClient: StreamrClient, module: NodeModule, props?: Partial<StreamProperties>): Promise<Stream> => {
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
        const c = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: key,
            },
            ...defaultOpts,
            ...opts,
        }, defaultParentContainer ?? parentContainer)

        addAfter(async () => {
            await wait(0)
            if (!c) { return }
            c.debug('disconnecting after test >>')
            await c.destroy()
            c.debug('disconnecting after test <<')
        })

        return c
    }
}

export const createEthereumAddress = (id: number): string => {
    return '0x' + padEnd(String(id), 40, '0')
}

type CreateMockMessageOptions = {
    publisher: Wallet
    content?: any
    msgChainId?: string
    timestamp?: number
    encryptionKey?: GroupKey
    nextEncryptionKey?: GroupKey
} & ({ streamPartId: StreamPartID, stream?: never } | { stream: Stream, streamPartId?: never })

export const createMockMessage = (
    opts: CreateMockMessageOptions
): Promise<StreamMessage<any>> => {
    const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(
        opts.streamPartId ?? opts.stream.getStreamParts()[0]
    )
    const factory = new MessageFactory({
        publisherId: opts.publisher.address.toLowerCase(),
        streamId,
        getPartitionCount: async () => MAX_PARTITION_COUNT,
        isPublicStream: async () => (opts.encryptionKey === undefined),
        isPublisher: async () => true,
        createSignature: async (payload: string) => sign(payload, opts.publisher.privateKey),
        useGroupKey: async () => {
            return (opts.encryptionKey !== undefined)
                ? ({ current: opts.encryptionKey, next: opts.nextEncryptionKey })
                : Promise.reject()
        }
    })
    const DEFAULT_CONTENT = {}
    const plainContent = opts.content ?? DEFAULT_CONTENT
    return factory.createMessage(plainContent, {
        timestamp: opts.timestamp ?? Date.now(),
        msgChainId: opts.msgChainId ?? `mockMsgChainId-${opts.publisher.address}`
    }, partition)
}

export const getGroupKeyStore = (userAddress: EthereumAddress): GroupKeyStore => {
    return new GroupKeyStore(
        mockContext(),
        {
            getAddress: () => userAddress.toLowerCase()
        } as any,
        new StreamrClientEventEmitter()
    )
}

export const startPublisherKeyExchangeSubscription = async (
    publisherClient: StreamrClient,
    streamPartId: StreamPartID): Promise<void> => {
    const node = await publisherClient.getNode()
    node.subscribe(streamPartId)
}
