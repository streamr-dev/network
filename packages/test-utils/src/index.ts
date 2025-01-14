import {
    EthereumAddress,
    toEthereumAddress,
    toUserId,
    UserID,
    until,
    waitForEvent,
    Logger,
    retry
} from '@streamr/utils'
import crypto, { randomBytes } from 'crypto'
import { AbstractSigner, Contract, JsonRpcProvider, parseEther, Provider, TransactionResponse, Wallet } from 'ethers'
import { EventEmitter, once } from 'events'
import express from 'express'
import random from 'lodash/random'
import { AddressInfo } from 'net'
import { Readable } from 'stream'
import { config as CHAIN_CONFIG } from '@streamr/config'

export type Event = string

const logger = new Logger(module)

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

// internal
const runAndWait = async (
    operations: (() => void) | (() => void)[],
    waitedEvents: [emitter: EventEmitter, event: Event] | [emitter: EventEmitter, event: Event][],
    timeout: number,
    promiseFn: (args: Promise<unknown>[]) => Promise<unknown[]>
): Promise<unknown[]> => {
    const ops = Array.isArray(operations) ? operations : [operations]

    let evs: [emitter: EventEmitter, event: Event][]
    if (Array.isArray(waitedEvents) && Array.isArray(waitedEvents[0])) {
        evs = waitedEvents as [emitter: EventEmitter, event: Event][]
    } else {
        evs = [waitedEvents as [emitter: EventEmitter, event: Event]]
    }

    const promise = promiseFn(evs.map(([emitter, event]) => waitForEvent(emitter, event, timeout)))
    ops.forEach((op) => {
        op()
    })
    return promise
}

/**
 * Run functions and wait for events to be emitted within timeout. Returns a promise created with Promise.all()
 * and waitForEvent() calls. Calls the functions after creating the promise.
 *
 * @param operations function(s) to call
 * @param waitedEvents event(s) to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred
 * within timeout. Otherwise rejected.
 */
export const runAndWaitForEvents = async (
    operations: (() => void) | (() => void)[],
    waitedEvents: [emitter: EventEmitter, event: Event] | [emitter: EventEmitter, event: Event][],
    timeout = 5000
): Promise<unknown[]> => {
    return runAndWait(operations, waitedEvents, timeout, Promise.all.bind(Promise))
}

/**
 * Run functions and wait for one of the events to be emitted within timeout. Returns a promise created with Promise.race()
 * and waitForEvent() calls. Calls the functions after creating the promise.
 *
 * @param operations function(s) to call
 * @param waitedEvents event(s) to wait for
 * @param timeout amount of time in milliseconds to wait for
 * @returns {Promise<unknown[]>} resolves with event arguments if event occurred
 * within timeout. Otherwise rejected.
 */
export const runAndRaceEvents = async (
    operations: (() => void) | (() => void)[],
    waitedEvents: [emitter: EventEmitter, event: Event] | [emitter: EventEmitter, event: Event][],
    timeout = 5000
): Promise<unknown[]> => {
    return runAndWait(operations, waitedEvents, timeout, Promise.race.bind(Promise))
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

export function fastPrivateKey(): string {
    return crypto.randomBytes(32).toString('hex')
}

export function fastWallet(): Wallet {
    return new Wallet(fastPrivateKey())
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
): Promise<{ url: string; stop: () => Promise<void> }> => {
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
    [K in keyof T]: (undefined extends T[K] ? never : T[K]) extends (...args: any[]) => any ? K : never
}[keyof T]

// Pick only methods of T
export type Methods<T> = Pick<T, MethodNames<T>>

import * as customMatchers from './customMatchers'
export { customMatchers }

const TEST_CHAIN_CONFIG = CHAIN_CONFIG.dev2

const getTestProvider = (): Provider => {
    return new JsonRpcProvider(TEST_CHAIN_CONFIG.rpcEndpoints[0].url, undefined, {
        batchStallTime: 0, // Don't batch requests, send them immediately
        cacheTimeout: -1 // Do not employ result caching
    })
}

const getTestTokenContract = (
    adminWallet: Wallet
): { mint: (targetAddress: string, amountWei: bigint) => Promise<TransactionResponse> } => {
    const ABI = [
        {
            inputs: [
                {
                    internalType: 'address',
                    name: 'to',
                    type: 'address'
                },
                {
                    internalType: 'uint256',
                    name: 'amount',
                    type: 'uint256'
                }
            ],
            name: 'mint',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function'
        }
    ]
    return new Contract(TEST_CHAIN_CONFIG.contracts.DATA, ABI).connect(adminWallet) as unknown as {
        mint: () => Promise<TransactionResponse>
    }
}

const getTestAdminWallet = (provider: Provider): Wallet => {
    return new Wallet(TEST_CHAIN_CONFIG.adminPrivateKey).connect(provider)
}

// TODO refactor method e.g. to createTestWallet({ gas: boolean, token: boolean })
export const generateWalletWithGasAndTokens = async (tokens = true): Promise<Wallet & AbstractSigner<Provider>> => {
    const provider = getTestProvider()
    const privateKey = crypto.randomBytes(32).toString('hex')
    const newWallet = new Wallet(privateKey)
    const adminWallet = getTestAdminWallet(provider)
    const token = getTestTokenContract(adminWallet)
    await retry(
        async () => {
            if (tokens) {
                await (await token.mint(newWallet.address, parseEther('1000000'))).wait()
            }
            await (
                await adminWallet.sendTransaction({
                    to: newWallet.address,
                    value: parseEther('1')
                })
            ).wait()
        },
        (message: string, err: any) => {
            logger.debug(message, { err })
        },
        'Token minting',
        10,
        100
    )
    return newWallet.connect(provider) as Wallet & AbstractSigner<Provider>
}

export const fetchPrivateKeyWithGas = async (): Promise<string> => {
    const wallet = await generateWalletWithGasAndTokens(false)
    return wallet.privateKey
}
