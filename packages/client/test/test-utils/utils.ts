import crypto from 'crypto'
import { DependencyContainer } from 'tsyringe'
import { fetchPrivateKeyWithGas } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import {
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils,
    StreamMessageOptions,
    MessageID,
    EthereumAddress,
    StreamID
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
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { addAfterFn } from './jest-utils'
import { TransformStream } from 'node:stream/web'
import { NetworkNodeStub } from '../../src/NetworkNodeFacade'
import { GroupKeyPersistence } from '../../src/encryption/GroupKeyStore'

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

export const createMockAddress = (): string => '0x000000000000000000000000000' + Date.now()

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

type CreateMockMessageOptionsBase = Omit<Partial<StreamMessageOptions<any>>, 'messageId' | 'signatureType'> & {
    publisher: Wallet
    msgChainId?: string
    timestamp?: number
    sequenceNumber?: number
    encryptionKey?: GroupKey
}

export const createMockMessage = (
    opts: CreateMockMessageOptionsBase
    & ({ streamPartId: StreamPartID, stream?: never } | { stream: Stream, streamPartId?: never })
): StreamMessage<any> => {
    const DEFAULT_CONTENT = {}
    const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(
        opts.streamPartId ?? opts.stream.getStreamParts()[0]
    )
    const msg = new StreamMessage({
        messageId: new MessageID(
            streamId,
            partition,
            opts.timestamp ?? Date.now(),
            opts.sequenceNumber ?? 0,
            opts.publisher.address,
            opts.msgChainId ?? `mockMsgChainId-${opts.publisher.address}`
        ),
        signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        content: DEFAULT_CONTENT,
        prevMsgRef: opts.prevMsgRef,
        ...opts
    })
    if (opts.encryptionKey !== undefined) {
        EncryptionUtil.encryptStreamMessage(msg, opts.encryptionKey)
    }
    msg.signature = sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), opts.publisher.privateKey)
    return msg
}

export const addSubscriber = <T>(networkNodeStub: NetworkNodeStub, ...streamPartIds: StreamPartID[]): AsyncIterableIterator<StreamMessage<T>> => {
    const messages = new TransformStream()
    const messageWriter = messages.writable.getWriter()
    networkNodeStub.addMessageListener((msg: StreamMessage) => {
        if (streamPartIds.includes(msg.getStreamPartID())) {
            messageWriter.write(msg)
        }
    })
    streamPartIds.forEach((id) => networkNodeStub.subscribe(id))
    return messages.readable[Symbol.asyncIterator]()
}

export const getGroupKeyPersistence = (streamId: StreamID, userAddress: EthereumAddress): GroupKeyPersistence => {
    return new GroupKeyPersistence({ 
        context: mockContext(), 
        clientId: userAddress.toLowerCase(), 
        streamId, 
        initialData: {}
    })
}
