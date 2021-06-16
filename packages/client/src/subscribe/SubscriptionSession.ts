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
    /** active subs */
    subscriptions: Set<Subscription> = new Set()
    pendingRemoval: Set<Subscription> = new Set()
    updateSubscriptions?: Todo
    _subscribe
    _unsubscribe

    constructor(client: StreamrClient, options: Todo) {
        super()
        this.client = client
        this.options = validateOptions(options)
        this.validate = Validator(client, this.options)
        this._subscribe = this.options.subscribe || subscribe
        this._unsubscribe = this.options.unsubscribe || unsubscribe

        this.id = counterId(`SubscriptionSession:${this.options.id || ''}${this.options.key}`)
        this.debug = this.client.debug.extend(this.id)
        this.debug('create')
        this._init()
    }

    _init() {
        const { key } = this.options

        let needsReset = false
        const onDisconnected = async () => {
            const { connection } = this.client
            // see if we should reset then retry connecting
            try {
                if (!connection.isConnectionValid()) {
                    await this.updateSubscriptions()
                    return
                }

                needsReset = true
                await this.updateSubscriptions()
                if (connection.isConnectionValid()) {
                    needsReset = false
                    await this.updateSubscriptions()
                }
            } catch (err) {
                this.emit('error', err)
            }
        }

        const check = () => {
            const { connection } = this.client
            return !!(
                connection.isConnectionValid()
                && !needsReset
                // has some active subscription
                && this.count()
            )
        }

        this.updateSubscriptions = Scaffold([
            () => {
                if (!needsReset) {
                    this.emit('subscribing')
                }

                needsReset = false
                // add handlers for connection close events
                const { connection } = this.client
                connection.on('done', onDisconnected)
                connection.on('disconnected', onDisconnected)
                connection.on('disconnecting', onDisconnected)

                return () => {
                    connection.off('done', onDisconnected)
                    connection.off('disconnected', onDisconnected)
                    connection.off('disconnecting', onDisconnected)
                }
            },
            // open connection
            async () => {
                const { connection } = this.client
                await connection.addHandle(key)
                return async () => {
                    if (needsReset) { return } // don't close connection if just resetting
                    await connection.removeHandle(key)
                }
            },
            // validate connected
            async () => {
                const { connection } = this.client
                await connection.needsConnection(`Subscribe ${key}`)
            },
            // subscribe
            async () => {
                await this._subscribe(this.client, this.options)
                return async () => {
                    if (needsReset) { return }
                    await this._unsubscribe(this.client, this.options)
                }
            }
        ], check, {
            onChange: (isGoingUp) => {
                if (needsReset) { return }

                if (!isGoingUp) {
                    this.emit('unsubscribing')
                }
            },
            onDone: async (isGoingUp) => {
                if (needsReset) { return }

                if (isGoingUp) {
                    this.emit('subscribed')
                } else {
                    this.emit('unsubscribed')
                    const { connection } = this.client
                    if (!connection.isConnectionValid()) {
                        await this.removeAll()
                    }
                }
            },
            onError: (err?: Error) => {
                this.debug('error', err)
                if (err instanceof ConnectionError && !check()) {
                    // ignore error if state changed
                    needsReset = true
                    return
                }

                throw err
            }
        })
    }

    has(sub: Subscription): boolean {
        return this.subscriptions.has(sub)
    }

    /**
     * Emit message on every subscription,
     * then on self.
     */

    emit(event: string | symbol, ...args: any[]): boolean {
        const subs = this.subscriptions
        if (event === 'error') {
            this.debug('emit', event, ...args)
        } else {
            this.debug('emit', event)
        }

        try {
            multiEmit(subs, event, ...args)
        } catch (error) {
            return super.emit('error', error)
        }

        return super.emit(event, ...args)
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Subscription): Promise<void> {
        if (!sub || this.subscriptions.has(sub) || this.pendingRemoval.has(sub)) { return } // already has
        const { id } = sub

        this.subscriptions.add(sub)
        this.debug('add >>', id)
        const { connection } = this.client
        await connection.addHandle(`adding${id}`)
        try {
            await connection.needsConnection(`Subscribe ${id}`)
            await this.updateSubscriptions()
        } finally {
            await connection.removeHandle(`adding${id}`)
            sub.emit('subscribed')
            this.debug('add <<', id)
        }
    }

    /**
     * Remove subscription & appropriate connection handle.
     */

    async remove(sub: Subscription): Promise<void> {
        if (!sub || this.pendingRemoval.has(sub) || !this.subscriptions.has(sub)) {
            return
        }

        const { id } = sub

        this.debug('remove >>', id)
        this.pendingRemoval.add(sub)
        this.subscriptions.delete(sub)
        sub.emit('unsubscribing')

        try {
            await sub.cancel()
        } finally {
            try {
                await this.updateSubscriptions()
            } finally {
                this.pendingRemoval.delete(sub)
                this.debug('remove <<', id)
            }
        }
    }

    /**
     * Remove all subscriptions & subscription connection handles
     */

    async removeAll(): Promise<void> {
        await Promise.all([...this.subscriptions].map((sub) => (
            this.remove(sub)
        )))
    }

    /**
     * How many subscriptions
     */

    count(): number {
        return this.subscriptions.size
    }
}
