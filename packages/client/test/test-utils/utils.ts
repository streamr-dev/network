import crypto from 'crypto'
import { writeHeapSnapshot } from 'v8'
import { DependencyContainer } from 'tsyringe'

import fetch from 'node-fetch'
import { KeyServer, wait } from 'streamr-test-utils'
import { Wallet } from 'ethers'
import {
    EthereumAddress,
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils,
    toStreamPartID,
    MAX_PARTITION_COUNT,
    StreamMessageOptions,
    MessageID,
    SigningUtil
} from 'streamr-client-protocol'

import { StreamrClient } from '../../src/StreamrClient'
import { counterId } from '../../src/utils/utils'
import { AggregatedError } from '../../src/utils/AggregatedError'
import { Debug } from '../../src/utils/log'
import { MaybeAsync } from '../../src/types'
import { Stream, StreamProperties } from '../../src/Stream'
import { ConfigTest } from '../../src/ConfigTest'

import { StreamPermission } from '../../src/permission'
import { padEnd } from 'lodash'
import { Context } from '../../src/utils/Context'
import { StreamrClientConfig } from '../../src/Config'
import { GroupKey } from '../../src/encryption/GroupKey'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'

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

export async function fetchPrivateKeyWithGas(): Promise<string> {
    let response
    try {
        response = await fetch(`http://localhost:${KeyServer.KEY_SERVER_PORT}/key`, {
            timeout: 5 * 1000
        })
    } catch (_e) {
        try {
            await KeyServer.startIfNotRunning() // may throw if parallel attempts at starting server
        } catch (_e2) {
        } finally {
            response = await fetch(`http://localhost:${KeyServer.KEY_SERVER_PORT}/key`, {
                timeout: 5 * 1000
            })
        }
    }

    if (!response.ok) {
        throw new Error(`fetchPrivateKeyWithGas failed ${response.status} ${response.statusText}: ${response.text()}`)
    }

    return response.text()
}

const TEST_REPEATS = (process.env.TEST_REPEATS) ? parseInt(process.env.TEST_REPEATS, 10) : 1

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function describeRepeats(msg: string, fn: any, describeFn = describe): void {
    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(msg, () => {
            describeFn(`test repeat ${k + 1} of ${TEST_REPEATS}`, fn)
        })
    }
}

describeRepeats.skip = (msg: any, fn: any) => {
    describe.skip(`${msg} – test repeat ALL of ${TEST_REPEATS}`, fn)
}

describeRepeats.only = (msg: any, fn: any) => {
    describeRepeats(msg, fn, describe.only)
}

export async function collect<T>(
    iterator: AsyncGenerator<StreamMessage<T>>,
    fn: MaybeAsync<(item: {
        msg: StreamMessage<T>,
        iterator: AsyncGenerator<StreamMessage<T>>,
        received: T[]
    }) => void> = async () => {}
): Promise<T[]> {
    const received: T[] = []
    for await (const msg of iterator) {
        received.push(msg.getParsedContent())
        await fn({
            msg, iterator, received,
        })
    }
    return received
}

export function getTestSetTimeout(): (callback: () => void, ms?: number | undefined) => NodeJS.Timeout {
    const addAfter = addAfterFn()
    return (callback: () => void, ms?: number) => {
        const t = setTimeout(callback, ms)
        addAfter(() => {
            clearTimeout(t)
        })
        return t
    }
}

export function addAfterFn(): (fn: any) => void {
    const afterFns: any[] = []
    afterEach(async () => {
        const fns = afterFns.slice()
        afterFns.length = 0
        // @ts-expect-error invalid parameter
        AggregatedError.throwAllSettled(await Promise.allSettled(fns.map((fn) => fn())))
    })

    return (fn: any) => {
        afterFns.push(fn)
    }
}

export const createMockAddress = (): string => '0x000000000000000000000000000' + Date.now()

export function getRandomClient(): StreamrClient {
    const wallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`)
    return new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: wallet.privateKey
        }
    })
}

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

/**
 * Write a heap snapshot file if WRITE_SNAPSHOTS env var is set.
 */
export function snapshot(): string {
    if (!process.env.WRITE_SNAPSHOTS) { return '' }
    testDebugRoot('heap snapshot >>')
    const value = writeHeapSnapshot()
    testDebugRoot('heap snapshot <<', value)
    return value
}

export const createEthereumAddress = (id: number): string => {
    return '0x' + padEnd(String(id), 40, '0')
}

export const createEthereumAddressCache = (): { getAddress: (privateKey: string) => EthereumAddress } => {
    const cache: Map<string, EthereumAddress> = new Map()
    return {
        getAddress: (privateKey: string): EthereumAddress => {
            let address = cache.get(privateKey)
            if (address === undefined) {
                address = new Wallet(privateKey).address
                cache.set(privateKey, address)
            }
            return address
        }
    }
}

// eslint-disable-next-line no-undef
export const createPartitionedTestStream = async (module: NodeModule): Promise<Stream> => {
    const client = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: await fetchPrivateKeyWithGas()
        }
    })
    const stream = await createTestStream(client, module, {
        partitions: MAX_PARTITION_COUNT
    })
    await stream.grantPermissions({
        public: true,
        permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
    })
    await client.destroy()
    return stream
}

export async function* createStreamPartIterator(stream: Stream): AsyncGenerator<StreamPartID> {
    for (let partition = 0; partition < stream.partitions; partition++) {
        yield toStreamPartID(stream.id, partition)
    }
}

export const toStreamDefinition = (streamPart: StreamPartID): { id: string, partition: number } => {
    const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPart)
    return {
        id,
        partition
    }
}

type CreateMockMessageOptionsBase = Omit<Partial<StreamMessageOptions<any>>, 'messageId' | 'signatureType'> & {
    publisher: Wallet
    msgChainId?: string
    timestamp?: number
    sequenceNumber?: number,
    encryptionKey?: GroupKey
}

export const createMockMessage = (
    opts: CreateMockMessageOptionsBase
    & ({ streamPartId: StreamPartID, stream?: never } | { stream: Stream, streamPartId?: never })
): StreamMessage<any> => {
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
            opts.msgChainId ?? 'msgChainId'
        ),
        signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        content: {},
        ...opts
    })
    if (opts.encryptionKey !== undefined) {
        EncryptionUtil.encryptStreamMessage(msg, opts.encryptionKey)
    }
    msg.signature = SigningUtil.sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), opts.publisher.privateKey)
    return msg
}