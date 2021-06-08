import Emitter from 'events'

import { AggregatedError, Scaffold, counterId } from '../utils'
import { validateOptions } from '../stream/utils'
import { ConnectionError } from '../Connection'

import { subscribe, unsubscribe } from './api'
import Validator from './Validator'
import Subscription from './Subscription'
import { Todo } from '../types'
import StreamrClient from '..'

/**
 * Emit event on all supplied emitters.
 * Aggregates errors rather than throwing on first.
 */

function multiEmit(emitters: Todo, ...args: Todo[]) {
    let error: Todo
    emitters.forEach((s: Todo) => {
        try {
            s.emit(...args)
        } catch (err) {
            AggregatedError.from(error, err, `Error emitting event: ${args[0]}`)
        }
    })

    if (error) {
        throw error
    }
}

/**
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

export default class SubscriptionSession extends Emitter {
    id
    debug
    client: StreamrClient
    options: ReturnType<typeof validateOptions> & {
        id: string
        subscribe: typeof subscribe
        unsubscribe: typeof unsubscribe
    }
    validate
    subscriptions: Set<Subscription>
    deletedSubscriptions: Set<Todo>
    step?: Todo
    _subscribe
    _unsubscribe

    constructor(client: StreamrClient, options: Todo) {
        super()
        this.client = client
        this.options = validateOptions(options)
        this.validate = Validator(client, this.options)
        this._subscribe = this.options.subscribe || subscribe
        this._unsubscribe = this.options.unsubscribe || unsubscribe

        this.subscriptions = new Set() // active subs
        this.deletedSubscriptions = new Set() // hold so we can clean up
        this.id = counterId(`SubscriptionSession:${this.options.id || ''}${this.options.key}`)
        this.debug = this.client.debug.extend(this.id)
        this.debug('create')
        this._init()
    }

    _init() {
        const { key } = this.options
        const { connection } = this.client

        let needsReset = false
        const onDisconnected = async () => {
            // see if we should reset then retry connecting
            try {
                if (!connection.isConnectionValid()) {
                    await this.step()
                    return
                }

                needsReset = true
                await this.step()
                if (connection.isConnectionValid()) {
                    needsReset = false
                    await this.step()
                }
            } catch (err) {
                this.emit('error', err)
            }
        }

        let deleted = new Set()
        const check = () => {
            return (
                connection.isConnectionValid()
                && !needsReset
                // has some active subscription
                && this.count()
            )
        }

        this.step = Scaffold([
            () => {
                needsReset = false
                return async () => {
                    // don't clean up if just resetting
                    if (needsReset) { return }

                    try {
                        this.emit('unsubscribed')
                    } finally {
                        deleted.forEach((s) => {
                            this.deletedSubscriptions.delete(s)
                        })
                    }
                    if (!connection.isConnectionValid()) {
                        await this.removeAll()
                    }
                }
            },
            // add handlers for connection close events
            () => {
                connection.on('done', onDisconnected)
                connection.on('disconnected', onDisconnected)
                connection.on('disconnecting', onDisconnected)
                this.emit('subscribing')

                return () => {
                    connection.off('done', onDisconnected)
                    connection.off('disconnected', onDisconnected)
                    connection.off('disconnecting', onDisconnected)
                }
            },
            // open connection
            async () => {
                await connection.addHandle(key)
                return async () => {
                    if (needsReset) { return } // don't close connection if just resetting
                    deleted = new Set(this.deletedSubscriptions)
                    await connection.removeHandle(key)
                }
            },
            // validate connected
            async () => {
                await connection.needsConnection(`Subscribe ${key}`)
            },
            // subscribe
            async () => {
                await this._subscribe(this.client, this.options)
                this.emit('subscribed')

                return async () => {
                    if (needsReset) { return }
                    this.emit('unsubscribing')
                    await this._unsubscribe(this.client, this.options)
                }
            }
        // @ts-expect-error
        ], check, {
            onError(err) {
                if (err instanceof ConnectionError && !check()) {
                    // ignore error if state changed
                    needsReset = true
                    return
                }
                throw err
            }
        })
    }

    has(sub: Todo) {
        return this.subscriptions.has(sub)
    }

    /**
     * Emit message on every subscription,
     * then on self.
     */

    emit(...args: Todo[]) {
        const subs = this._getSubs()
        if (args[0] === 'error') {
            this.debug(args[0], args[1])
        } else {
            this.debug(args[0])
        }

        try {
            multiEmit(subs, ...args)
        } catch (error) {
            return super.emit('error', error)
        }
        // @ts-expect-error
        return super.emit(...args)
    }

    _getSubs() {
        // all known subs
        return new Set([
            ...this.deletedSubscriptions,
            ...this.subscriptions,
        ])
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Todo) {
        this.subscriptions.add(sub)
        this.debug('add', sub && sub.id)
        const { connection } = this.client
        await connection.addHandle(`adding${sub.id}`)
        try {
            await connection.needsConnection(`Subscribe ${sub.id}`)
            await this.step()
        } finally {
            await connection.removeHandle(`adding${sub.id}`)
        }
    }

    /**
     * Remove subscription & appropriate connection handle.
     */

    async remove(sub: Todo) {
        this.subscriptions.delete(sub)

        if (this.deletedSubscriptions.has(sub)) {
            return
        }

        if (this.subscriptions.has(sub)) {
            this.debug('remove', sub && sub.id)
        }

        const cancelTask = sub.cancel()
        try {
            this.subscriptions.delete(sub)
            this.deletedSubscriptions.add(sub)
            await this.step()
        } finally {
            await cancelTask
        }
    }

    /**
     * Remove all subscriptions & subscription connection handles
     */

    async removeAll() {
        const subs = this._getSubs()
        return Promise.all([...subs].map((sub) => (
            this.remove(sub)
        )))
    }

    /**
     * How many subscriptions
     */

    count() {
        return this.subscriptions.size
    }
}
