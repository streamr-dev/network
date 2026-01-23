import { config as CHAIN_CONFIG } from '@streamr/config'
import { DATAv2ABI as DATATokenABI, DATAv2 as DATATokenContract, Operator as OperatorContract } from '@streamr/network-contracts'
import { binaryToHex, EthereumAddress, Logger, retry, toEthereumAddress, toUserId, until, UserID } from '@streamr/utils'
import crypto, { randomBytes } from 'crypto'
import { AbstractSigner, Contract, JsonRpcProvider, parseEther, Provider, Wallet } from 'ethers'
import { EventEmitter, once } from 'events'
import express from 'express'
import random from 'lodash/random'
import range from 'lodash/range'
import { AddressInfo } from 'net'
import { Readable } from 'stream'

export type Event = string

const logger = new Logger('test-utils')

/**
 * Collect data of a stream into an array. The array is wrapped in a
 * Promise that resolves when the stream has ended, i.e., event `end` is
 * emitted by stream.
 *
 * @param {ReadableStream} stream to collect data from
 * @returns {Promise<unknown[]>} resolves with array of collected data when
 * stream ends. Rejects if stream encounters `error` event.
 */
export const waitForStreamToEnd = (stream: Readable): Promise<unknown[]> => {
    const arr: unknown[] = []
    return new Promise((resolve, reject) => {
        stream
            .on('data', arr.push.bind(arr))
            .on('error', reject)
            .on('end', () => resolve(arr))
    })
}

/**
 * Collect events emitted by an emitter into an array.
 *
 * @param emitter emitter of event(s)
 * @param events list of event types to collect
 * @returns {Array<Event>} array that is pushed to every time emitter emits an event that
 * is defined in `events`
 */
export const eventsToArray = (emitter: EventEmitter, events: readonly Event[]): Event[] => {
    const array: Event[] = []
    events.forEach((e) => {
        emitter.on(e, () => array.push(e))
    })
    return array
}

/**
 * Collect events emitted by an emitter into an array, including event arguments.
 *
 * @param emitter emitter of event(s)
 * @param events list of event types to collect
 * @returns {Array<[Event, ...any]>} array that is pushed to every time emitter emits an event that
 * is defined in `events`, includes event arguments
 */
export const eventsWithArgsToArray = (emitter: EventEmitter, events: readonly Event[]): [Event, ...any][] => {
    const array: [Event, ...any][] = []
    events.forEach((e) => {
        emitter.on(e, (...args) => array.push([e, ...args]))
    })
    return array
}

/**
 * Create a {ReadableStream} out of an array of items. Any {Error} items will
 * be emitted as error events instead of pushed to stream.
 * @param args an array of items
 * @returns {ReadableStream}
 */
export const toReadableStream = (...args: unknown[]): Readable => {
    const messagesOrErrors = [...args]
    const rs = new Readable({
        objectMode: true,
        read: () => {
            const item = messagesOrErrors.shift()
            if (item == null) {
                rs.push(null) // end-of-stream
            } else if (item instanceof Error) {
                rs.emit('error', item)
            } else {
                rs.push(item)
            }
        }
    })
    return rs
}

export function randomEthereumAddress(): EthereumAddress {
    return toEthereumAddress('0x' + crypto.randomBytes(20).toString('hex'))
}

export const randomUserId = (): UserID => {
    return toUserId(randomBytes(random(10, 40)))
}

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any
export function isRunningInElectron(): boolean {
    return typeof _streamr_electron_test !== 'undefined'
}

export function testOnlyInNodeJs(...args: Parameters<typeof it>): void {
    if (isRunningInElectron()) {
        it.skip(...args)
    } else {
        it(...args)
    }
}

export function describeOnlyInNodeJs(...args: Parameters<typeof describe>): void {
    if (isRunningInElectron()) {
        describe.skip(...args)
    } else {
        describe(...args)
    }
}

export class Queue<T> {

    private readonly items: T[] = []

    push(item: T): void {
        this.items.push(item)
    }

    async pop(timeout?: number): Promise<T> {
        await until(() => this.items.length > 0, timeout)
        return this.items.shift()!
    }

    size(): number {
        return this.items.length
    }

    values(): T[] {
        return this.items
    }

    [Symbol.iterator](): Iterator<T> {
        return this.items[Symbol.iterator]()
    }
}

export const startTestServer = async (
    endpoint: string,
    onRequest: (req: express.Request, res: express.Response) => Promise<void>
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

// Get property names which have a Function-typed value i.e. a method
type MethodNames<T> = {
    // undefined extends T[K] to handle optional properties
    [K in keyof T]: (
        (undefined extends T[K] ? never : T[K]) extends (...args: any[]) => any ? K : never
    )
}[keyof T]

// Pick only methods of T
export type Methods<T> = Pick<T, MethodNames<T>>

export { customMatchers } from './customMatchers'

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

export const getTestProvider = (): JsonRpcProvider => {
    return new JsonRpcProvider(TEST_CHAIN_CONFIG.rpcEndpoints[0].url, undefined, {
        batchStallTime: 0,       // Don't batch requests, send them immediately
        cacheTimeout: -1         // Do not employ result caching
    })
}

export const getTestTokenContract = (): DATATokenContract => {
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, DATATokenABI) as unknown as DATATokenContract
}

export const getTestAdminWallet = (provider?: Provider): Wallet => {
    return new Wallet(TEST_CHAIN_CONFIG.adminPrivateKey).connect(provider ?? getTestProvider())
}

const fastPrivateKey = (): string => {
    return binaryToHex(crypto.randomBytes(32), true)
}

export const createTestWallet = async (opts?: { gas?: boolean, tokens?: boolean }): Promise<Wallet & AbstractSigner<Provider>> => {
    const provider = getTestProvider()
    const newWallet = new Wallet(fastPrivateKey())
    if (opts?.gas || opts?.tokens) {
        const adminWallet = getTestAdminWallet(provider)
        const token = getTestTokenContract().connect(adminWallet)
        await retry(
            async () => {
                if (opts?.gas) {
                    await (await adminWallet.sendTransaction({
                        to: newWallet.address,
                        value: parseEther('1')
                    })).wait()
                }
                if (opts?.tokens) {
                    await (await token.mint(newWallet.address, parseEther('1000000'))).wait()
                }
            },
            (message: string, err: any) => {
                logger.debug(message, { err })
            },
            'Token minting',
            10,
            100
        )
    }
    return newWallet.connect(provider) as (Wallet & AbstractSigner<Provider>)
}

export const createTestPrivateKey = async (opts?: { gas?: boolean, tokens?: boolean }): Promise<string> => {
    if (opts?.gas || opts?.tokens) {
        const wallet = await createTestWallet(opts)
        return wallet.privateKey
    } else {
        return fastPrivateKey()
    }
}

export type SignerWithProvider = AbstractSigner<Provider>

export interface setupTestOperatorContractOpts {
    nodeCount?: number
    operatorConfig?: {
        operatorsCutPercentage?: number
        metadata?: string
    }
    deployTestOperatorContract: (opts: {
        deployer: SignerWithProvider
        operatorsCutPercentage?: number
        metadata?: string
        operatorTokenName?: string
    }) => Promise<OperatorContract>
}

export interface setupTestOperatorContractReturnType {
    operatorWallet: Wallet & SignerWithProvider
    operatorContractAddress: EthereumAddress
    nodeWallets: (Wallet & SignerWithProvider)[]
}

export async function setupTestOperatorContract(
    opts: setupTestOperatorContractOpts
): Promise<setupTestOperatorContractReturnType> {
    const operatorWallet = await createTestWallet({ gas: true, tokens: true })
    const operatorContract = await opts.deployTestOperatorContract({
        deployer: operatorWallet,
        operatorsCutPercentage: opts?.operatorConfig?.operatorsCutPercentage,
        metadata: opts?.operatorConfig?.metadata
    })
    const nodeWallets: (Wallet & SignerWithProvider)[] = []
    if ((opts?.nodeCount !== undefined) && (opts?.nodeCount > 0)) {
        for (const _ of range(opts.nodeCount)) {
            nodeWallets.push(await createTestWallet({ gas: true, tokens: true }))
        }
        await (await operatorContract.setNodeAddresses(nodeWallets.map((w) => w.address))).wait()
    }
    return { operatorWallet, operatorContractAddress: toEthereumAddress(await operatorContract.getAddress()), nodeWallets }
}
