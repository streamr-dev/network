/**
 * @see {@link StreamrClient.StreamrClient}
 * @module StreamrClient
 */
import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { counterId, uuid, CacheAsyncFn } from './utils'
import { validateOptions } from './stream/utils'
import Config, { StreamrClientOptions, StrictStreamrClientOptions } from './Config'
import StreamrEthereum from './Ethereum'
import Session from './Session'
import Connection, { ConnectionError, ConnectionOptions } from './Connection'
import Publisher from './publish'
import { Subscriber, Subscription } from './subscribe'
import { getUserId } from './user'
import { Todo, MaybeAsync, EthereumAddress } from './types'
import { StreamEndpoints } from './rest/StreamEndpoints'
import { LoginEndpoints } from './rest/LoginEndpoints'
import { DataUnion, DataUnionDeployOptions } from './dataunion/DataUnion'
import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { Contract } from '@ethersproject/contracts'
import { StreamPartDefinition } from './stream'

// TODO get metadata type from streamr-protocol-js project (it doesn't export the type definitions yet)
export type OnMessageCallback = MaybeAsync<(message: any, metadata: any) => void>

export type ResendOptions = {
    from?: { timestamp: number, sequenceNumber?: number }
    to?: { timestamp: number, sequenceNumber?: number }
    last?: number
}

export type SubscribeOptions = {
    resend?: ResendOptions
} & ResendOptions

interface MessageEvent {
    data: any
}

const balanceOfAbi = [{
    name: 'balanceOf',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    constant: true,
    payable: false,
    stateMutability: 'view',
    type: 'function'
}]

/**
 * Wrap connection message events with message parsing.
 */
class StreamrConnection extends Connection {
    // TODO define args type when we convert Connection class to TypeScript
    constructor(options: ConnectionOptions, debug?: Debug.Debugger) {
        super(options, debug)
        this.on('message', this.onConnectionMessage)
    }

    // eslint-disable-next-line class-methods-use-this
    parse(messageEvent: MessageEvent) {
        return ControlLayer.ControlMessage.deserialize(messageEvent.data)
    }

    onConnectionMessage(messageEvent: MessageEvent) {
        let controlMessage
        try {
            controlMessage = this.parse(messageEvent)
        } catch (err) {
            this.debug('(%o) << %o', this.getState(), messageEvent && messageEvent.data)
            this.debug('deserialize error', err)
            this.emit('error', err)
            return
        }

        if (!controlMessage) {
            return
        }

        this.debug('(%o) << %o', this.getState(), controlMessage)
        this.emit(controlMessage.type, controlMessage)
    }
}

class StreamrCached {
    client: StreamrClient
    // TODO change all "any" types in this class to valid types when CacheAsyncFn is converted to TypeScript
    getStream: any
    getUserInfo: any
    isStreamPublisher: any
    isStreamSubscriber: any
    getUserId: any

    constructor(client: StreamrClient) {
        this.client = client
        const cacheOptions: Todo = client.options.cache
        this.getStream = CacheAsyncFn(client.getStream.bind(client), {
            ...cacheOptions,
            cacheKey([maybeStreamId]: any) {
                const { streamId } = validateOptions(maybeStreamId)
                return streamId
            }
        })
        this.getUserInfo = CacheAsyncFn(client.getUserInfo.bind(client), cacheOptions)
        this.isStreamPublisher = CacheAsyncFn(client.isStreamPublisher.bind(client), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]: any) {
                const { streamId } = validateOptions(maybeStreamId)
                return `${streamId}|${ethAddress}`
            }
        })

        this.isStreamSubscriber = CacheAsyncFn(client.isStreamSubscriber.bind(client), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]: any) {
                const { streamId } = validateOptions(maybeStreamId)
                return `${streamId}|${ethAddress}`
            }
        })

        this.getUserId = CacheAsyncFn(client.getUserId.bind(client), cacheOptions)
    }

    clearStream(streamId: string) {
        this.getStream.clear()
        this.isStreamPublisher.clearMatching((s: string) => s.startsWith(streamId))
        this.isStreamSubscriber.clearMatching((s: string) => s.startsWith(streamId))
    }

    clearUser() {
        this.getUserInfo.clear()
        this.getUserId.clear()
    }

    clear() {
        this.clearUser()
        // @ts-expect-error
        this.clearStream()
    }
}

// use process id in node uid
const uid = process.pid != null ? process.pid : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

/**
 * Take prototype functions from srcInstance and attach them to targetInstance while keeping them bound to srcInstance.
 */
function Plugin(targetInstance: any, srcInstance: any) {
    Object.getOwnPropertyNames(srcInstance.constructor.prototype).forEach((name) => {
        const value = srcInstance.constructor.prototype[name]
        if (typeof value !== 'function') { return }
        // eslint-disable-next-line no-param-reassign
        targetInstance[name] = srcInstance[name].bind(srcInstance)
    })
    return srcInstance
}

// these are mixed in via Plugin function above
export interface StreamrClient extends StreamEndpoints, LoginEndpoints {}

/**
 * @category Important
 */
export class StreamrClient extends EventEmitter { // eslint-disable-line no-redeclare
    /** @internal */
    id: string
    /** @internal */
    debug: Debug.Debugger
    /** @internal */
    options: StrictStreamrClientOptions
    /** @internal */
    session: Session
    /** @internal */
    connection: StreamrConnection
    /** @internal */
    publisher: Todo
    /** @internal */
    subscriber: Subscriber
    /** @internal */
    cached: StreamrCached
    /** @internal */
    ethereum: StreamrEthereum

    // TODO annotate connection parameter as internal parameter if possible?
    constructor(options: StreamrClientOptions = {}, connection?: StreamrConnection) {
        super()
        this.id = counterId(`${this.constructor.name}:${uid}${options.id || ''}`)
        this.debug = Debug(this.id)

        this.options = Config(options)

        this.debug('new StreamrClient %s: %o', this.id, {
            version: process.env.version,
            GIT_VERSION: process.env.GIT_VERSION,
            GIT_COMMITHASH: process.env.GIT_COMMITHASH,
            GIT_BRANCH: process.env.GIT_BRANCH,
        })

        // bind event handlers
        this.onConnectionConnected = this.onConnectionConnected.bind(this)
        this.onConnectionDisconnected = this.onConnectionDisconnected.bind(this)
        this._onError = this._onError.bind(this)
        this.onConnectionError = this.onConnectionError.bind(this)
        this.getErrorEmitter = this.getErrorEmitter.bind(this)

        this.on('error', this._onError) // attach before creating sub-components incase they fire error events

        this.session = new Session(this, this.options.auth)
        this.connection = connection || new StreamrConnection(this.options, this.debug)

        this.connection
            .on('connected', this.onConnectionConnected)
            .on('disconnected', this.onConnectionDisconnected)
            .on('error', this.onConnectionError)

        this.ethereum = new StreamrEthereum(this)
        this.publisher = Publisher(this)
        this.subscriber = new Subscriber(this)

        Plugin(this, new StreamEndpoints(this))
        Plugin(this, new LoginEndpoints(this))
        this.cached = new StreamrCached(this)
    }

    /** @internal */
    async onConnectionConnected() {
        this.debug('Connected!')
        this.emit('connected')
    }

    /** @internal */
    async onConnectionDisconnected() {
        this.debug('Disconnected.')
        this.emit('disconnected')
    }

    /** @internal */
    onConnectionError(err: Todo) {
        this.emit('error', new ConnectionError(err))
    }

    /** @internal */
    getErrorEmitter(source: Todo) {
        return (err: Todo) => {
            if (!(err instanceof ConnectionError || err.reason instanceof ConnectionError)) {
                // emit non-connection errors
                this.emit('error', err)
            } else {
                source.debug(err)
            }
        }
    }

    /** @internal */
    _onError(err: Todo, ...args: Todo) {
        // @ts-expect-error
        this.onError(err, ...args)
    }

    /** @internal */
    async send(request: Todo) {
        return this.connection.send(request)
    }

    /**
     * Override to control output
     */
    onError(error: Error) { // eslint-disable-line class-methods-use-this
        console.error(error)
    }

    isConnected() {
        return this.connection.isConnected()
    }

    isConnecting() {
        return this.connection.isConnecting()
    }

    isDisconnecting() {
        return this.connection.isDisconnecting()
    }

    isDisconnected() {
        return this.connection.isDisconnected()
    }

    /**
     * @category Important
     */
    async connect() {
        return this.connection.connect()
    }

    async nextConnection() {
        return this.connection.nextConnection()
    }

    /**
     * @category Important
     */
    disconnect() {
        this.publisher.stop()
        return Promise.all([
            this.subscriber.subscriptions.removeAll(),
            this.connection.disconnect()
        ])
    }

    getSubscriptions() {
        return this.subscriber.getAll()
    }

    getSubscription(definition: StreamPartDefinition) {
        return this.subscriber.get(definition)
    }

    async ensureConnected() {
        return this.connect()
    }

    async ensureDisconnected() {
        return this.disconnect()
    }

    logout() {
        return this.session.logout()
    }

    /**
     * @category Important
     */
    async publish(streamObjectOrId: StreamPartDefinition, content: object, timestamp?: number|string|Date, partitionKey?: string) {
        return this.publisher.publish(streamObjectOrId, content, timestamp, partitionKey)
    }

    async getUserId() {
        return getUserId(this)
    }

    setNextGroupKey(...args: Todo) {
        return this.publisher.setNextGroupKey(...args)
    }

    rotateGroupKey(...args: Todo) {
        return this.publisher.rotateGroupKey(...args)
    }

    /**
     * @category Important
     */
    async subscribe(opts: SubscribeOptions & StreamPartDefinition, onMessage?: OnMessageCallback) {
        let subTask: Todo
        let sub: Todo
        const hasResend = !!(opts.resend || opts.from || opts.to || opts.last)
        const onEnd = (err?: Error) => {
            if (sub && typeof onMessage === 'function') {
                sub.off('message', onMessage)
            }

            if (err) {
                throw err
            }
        }

        if (hasResend) {
            subTask = this.subscriber.resendSubscribe(opts, onEnd)
        } else {
            subTask = this.subscriber.subscribe(opts, onEnd)
        }

        if (typeof onMessage === 'function') {
            Promise.resolve(subTask).then(async (s) => {
                sub = s
                sub.on('message', onMessage)
                for await (const msg of sub) {
                    sub.emit('message', msg.getParsedContent(), msg)
                }
                return sub
            }).catch((err) => {
                this.emit('error', err)
            })
        }
        return subTask
    }

    /**
     * @category Important
     */
    async unsubscribe(subscription: Subscription) {
        await this.subscriber.unsubscribe(subscription)
    }

    /**
     * @category Important
     */
    async resend(opts: Todo, onMessage?: OnMessageCallback): Promise<Subscription> {
        const task = this.subscriber.resend(opts)
        if (typeof onMessage !== 'function') {
            return task
        }

        Promise.resolve(task).then(async (sub) => {
            for await (const msg of sub) {
                await onMessage(msg.getParsedContent(), msg)
            }

            return sub
        }).catch((err) => {
            this.emit('error', err)
        })

        return task
    }

    enableAutoConnect(autoConnect?: boolean) {
        return this.connection.enableAutoConnect(autoConnect)
    }

    enableAutoDisconnect(autoDisconnect?: boolean) {
        return this.connection.enableAutoDisconnect(autoDisconnect)
    }

    async getAddress(): Promise<EthereumAddress> {
        return this.ethereum.getAddress()
    }

    async getPublisherId(): Promise<EthereumAddress> {
        return this.getAddress()
    }

    /**
     * True if authenticated with private key/ethereum provider
     */
    canEncrypt() {
        return this.ethereum.canEncrypt()
    }

    /**
     * Get token balance in "wei" (10^-18 parts) for given address
     */
    async getTokenBalance(address: EthereumAddress): Promise<BigNumber> {
        const { tokenAddress } = this.options
        const addr = getAddress(address)
        const provider = this.ethereum.getMainnetProvider()
        const token = new Contract(tokenAddress, balanceOfAbi, provider)
        return token.balanceOf(addr)
    }

    /**
     * Get token balance in "wei" (10^-18 parts) for given address in sidechain
     */
    async getSidechainTokenBalance(address: EthereumAddress): Promise<BigNumber> {
        const { tokenSidechainAddress } = this.options
        const addr = getAddress(address)
        const provider = this.ethereum.getSidechainProvider()
        const token = new Contract(tokenSidechainAddress, balanceOfAbi, provider)
        return token.balanceOf(addr)
    }

    getDataUnion(contractAddress: EthereumAddress) {
        return DataUnion._fromContractAddress(contractAddress, this) // eslint-disable-line no-underscore-dangle
    }

    async deployDataUnion(options?: DataUnionDeployOptions) {
        return DataUnion._deploy(options, this) // eslint-disable-line no-underscore-dangle
    }

    /** @internal */
    _getDataUnionFromName({ dataUnionName, deployerAddress }: { dataUnionName: string, deployerAddress: EthereumAddress}) {
        return DataUnion._fromName({ // eslint-disable-line no-underscore-dangle
            dataUnionName,
            deployerAddress
        }, this)
    }

    /**
     * @category Important
     */
    static generateEthereumAccount() {
        return StreamrEthereum.generateEthereumAccount()
    }
}
