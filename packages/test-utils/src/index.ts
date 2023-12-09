import { Wallet } from '@ethersproject/wallet'
import { EthereumAddress, toEthereumAddress, waitForCondition, waitForEvent } from '@streamr/utils'
import cors from 'cors'
import crypto from 'crypto'
import { EventEmitter, once } from 'events'
import express, { Request, Response } from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import fetch from 'node-fetch'
import { Readable } from 'stream'

export type Event = string

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
    operations: (() => void) | ((() => void)[]),
    waitedEvents: [emitter: EventEmitter, event: Event] | Array<[emitter: EventEmitter, event: Event]>,
    timeout: number,
    promiseFn: (args: Array<Promise<unknown>>) => Promise<unknown[]>
): Promise<unknown[]> => {
    const ops = Array.isArray(operations) ? operations : [operations]

    let evs: Array<[emitter: EventEmitter, event: Event]>
    if (Array.isArray(waitedEvents) && Array.isArray(waitedEvents[0])) {
        evs = waitedEvents as Array<[emitter: EventEmitter, event: Event]>
    } else {
        evs = [waitedEvents as [emitter: EventEmitter, event: Event]]
    }

    const promise = promiseFn(evs.map(([emitter, event]) => waitForEvent(emitter, event, timeout)))
    ops.forEach((op) => { op() })
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
    operations: (() => void) | ((() => void)[]), 
    waitedEvents: [emitter: EventEmitter, event: Event] | Array<[emitter: EventEmitter, event: Event]>,
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
    operations: (() => void) | ((() => void)[]), 
    waitedEvents: [emitter: EventEmitter, event: Event] | Array<[emitter: EventEmitter, event: Event]>, 
    timeout = 5000
): Promise<unknown[]> => {
    return runAndWait(operations, waitedEvents, timeout, Promise.race.bind(Promise))
}

/**
 * Run functions and wait conditions to become true by re-evaluating every `retryInterval` milliseconds. Returns a promise created with Promise.all() 
 * and waitForCondition() calls. Calls the functions after creating the promise.
 * 
 * @param operations function(s) to call
 * @param conditions condition(s) to be evaluated; condition functions should return boolean or Promise<boolean> and have
 * no side-effects.
 * @param timeout amount of time in milliseconds to wait for
 * @param retryInterval how often, in milliseconds, to re-evaluate condition
 * @param onTimeoutContext evaluated only on timeout. Used to associate human-friendly textual context to error.
 * @returns {Promise<unknown[]>} resolves immediately if
 * conditions evaluate to true on a retry attempt within timeout. If timeout
 * is reached with conditionFn never evaluating to true, rejects.
 */
export const runAndWaitForConditions = async (
    operations: (() => void) | ((() => void)[]), 
    conditions: (() => (boolean | Promise<boolean>)) | (() => (boolean | Promise<boolean>)) [],
    timeout = 5000,
    retryInterval = 100,
    onTimeoutContext?: () => string
): Promise<unknown[]> => {
    const ops = Array.isArray(operations) ? operations : [operations]
    const conds = Array.isArray(conditions) ? conditions : [conditions]
    const promise = Promise.all(conds.map((condition) => waitForCondition(
        condition,
        timeout,
        retryInterval,
        undefined,
        onTimeoutContext
    )))
    ops.forEach((op) => { op() })
    return promise
}

/**
 * Collect events emitted by an emitter into an array.
 *
 * @param emitter emitter of event(s)
 * @param events list of event types to collect
 * @returns {Array<Event>} array that is pushed to every time emitter emits an event that
 * is defined in `events`
 */
export const eventsToArray = (emitter: EventEmitter, events: ReadonlyArray<Event>): Event[] => {
    const array: Array<Event> = []
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
export const eventsWithArgsToArray = (emitter: EventEmitter, events: ReadonlyArray<Event>): Array<[Event, ...any]> => {
    const array: Array<[Event, ...any]> = []
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

// eslint-disable-next-line no-underscore-dangle
declare let _streamr_electron_test: any
export function isRunningInElectron(): boolean {
    // eslint-disable-next-line no-underscore-dangle
    return typeof _streamr_electron_test !== 'undefined'
}

/**
 * Used to spin up an HTTP server used by integration tests to fetch private keys having non-zero ERC-20 token
 * balances in streamr-docker-dev environment.
 */
/* eslint-disable no-console */
export class KeyServer {
    private port: number // 45454
    private firstId: number 
    private lastId: number
    private static singleton: KeyServer | undefined
    private readonly ready: Promise<unknown>
    private server?: http.Server

    public static async startIfNotRunning(port: number, firstId: number, lastId: number): Promise<void> {
        if (KeyServer.singleton === undefined) {
            KeyServer.singleton = new KeyServer(port, firstId, lastId)
            await KeyServer.singleton.ready
        }
    }

    public static async stopIfRunning(): Promise<void> {
        if (KeyServer.singleton !== undefined) {
            const temp = KeyServer.singleton
            KeyServer.singleton = undefined
            await temp.destroy()
        }
    }

    private constructor(port: number, firstId: number, lastId: number) {
        this.port = port
        this.firstId = firstId
        this.lastId = lastId

        const app = express()
        app.use(cors())
        let c = this.firstId
        app.get('/key', (_req, res) => {
            const hexString = c.toString(16)
            const privateKey = '0x' + hexString.padStart(64, '0')
            res.send(privateKey)
            c += 1
            if (c > this.lastId) {
                c = 1
            } else if (c === 10) {
                /*
                    NET-666: There is something weird about the 10th key '0x0000000000....a'
                    that causes StreamRegistryContract to read a weird value to msg.sender
                    that does NOT correspond to the public address. Until that is investigated
                    and solved, skipping this key.
                 */
                c = 11
            }
        })
        console.info(`starting up keyserver on port ${this.port}...`)
        this.ready = new Promise((resolve, reject) => {
            this.server = app.listen(this.port, '0.0.0.0')
                .once('listening', () => {
                    console.info(`keyserver started on port ${this.port} to serve keys ${this.firstId} to ${this.lastId}`)
                    resolve(true)
                })
                .once('error', (err) => {
                    reject(err)
                })
        })
    }

    private destroy(): Promise<unknown> {
        if (this.server === undefined) {
            return Promise.resolve(true)
        }
        return new Promise((resolve, reject) => {
            this.server!.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    console.info(`closed keyserver on port ${this.port}`)
                    resolve(true)
                }
            })
        })
    }
}

export async function fetchPrivateKeyWithGas(keyServerPort: number): Promise<string> {
    let response
    try {
        response = await fetch(`http://127.0.0.1:${keyServerPort}/key`, {
            timeout: 5 * 1000
        })
    } catch (e) {
        throw new Error(`fetchPrivateKeyWithGas failed: ${e}`)
    }

    if (!response.ok) {
        throw new Error(`fetchPrivateKeyWithGas failed ${response.status} ${response.statusText}: ${await response.text()}`)
    }

    return response.text()
}

export class Queue<T> {

    private readonly items: T[] = []

    push(item: T): void {
        this.items.push(item)
    }

    async pop(timeout?: number): Promise<T> {
        await waitForCondition(() => this.items.length > 0, timeout)
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
