import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { counterId, uuid, CacheAsyncFn } from './utils'
import { validateOptions } from './stream/utils'
import Config, { StreamrClientOptions, StrictStreamrClientOptions } from './Config'
import StreamrEthereum from './Ethereum'
import Session from './Session'
import Connection, { ConnectionError } from './Connection'
import Publisher from './publish'
import { Subscriber } from './subscribe'
import { getUserId } from './user'
import { Todo, MaybeAsync, EthereumAddress } from './types'
import { StreamEndpoints } from './rest/StreamEndpoints'
import { LoginEndpoints } from './rest/LoginEndpoints'
import { DataUnion, DataUnionDeployOptions } from './dataunion/DataUnion'
import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { Contract } from '@ethersproject/contracts'

// TODO get metadata type from streamr-protocol-js project (it doesn't export the type definitions yet)
export type OnMessageCallback = MaybeAsync<(message: any, metadata: any) => void>

interface MessageEvent {
    data: any
}

/**
 * Wrap connection message events with message parsing.
 */

class StreamrConnection extends Connection {
    // TODO define args type when we convert Connection class to TypeScript
    constructor(options: Todo, debug?: Debug.Debugger) {
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

// eslint-disable-next-line no-redeclare
export class StreamrClient extends EventEmitter {
    id: string
    debug: Debug.Debugger
    options: StrictStreamrClientOptions
    /** @internal */
    session: Session
    connection: StreamrConnection
    publisher: Todo
    subscriber: Subscriber
    cached: StreamrCached
    ethereum: StreamrEthereum
    streamEndpoints: StreamEndpoints
    loginEndpoints: LoginEndpoints

    constructor(options: StreamrClientOptions = {}, connection?: StreamrConnection) {
        super()
        this.id = counterId(`${this.constructor.name}:${uid}`)
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

        this.publisher = Publisher(this)
        this.subscriber = new Subscriber(this)
        this.ethereum = new StreamrEthereum(this)

        this.streamEndpoints = Plugin(this, new StreamEndpoints(this))
        this.loginEndpoints = Plugin(this, new LoginEndpoints(this))
        this.cached = new StreamrCached(this)
    }

    async onConnectionConnected() {
        this.debug('Connected!')
        this.emit('connected')
    }

    async onConnectionDisconnected() {
        this.debug('Disconnected.')
        this.emit('disconnected')
    }

    onConnectionError(err: Todo) {
        this.emit('error', new ConnectionError(err))
    }

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

    _onError(err: Todo, ...args: Todo) {
        // @ts-expect-error
        this.onError(err, ...args)
    }

    async send(request: Todo) {
        return this.connection.send(request)
    }

    /**
     * Override to control output
     */

    onError(error: Todo) { // eslint-disable-line class-methods-use-this
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

    async connect() {
        return this.connection.connect()
    }

    async nextConnection() {
        return this.connection.nextConnection()
    }

    disconnect() {
        this.publisher.stop()
        return Promise.all([
            this.subscriber.subscriptions.removeAll(),
            this.connection.disconnect()
        ])
    }

    getSubscriptions(...args: Todo) {
        return this.subscriber.getAll(...args)
    }

    getSubscription(...args: Todo) {
        // @ts-expect-error
        return this.subscriber.get(...args)
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

    async publish(...args: Todo) {
        return this.publisher.publish(...args)
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

    async subscribe(opts: Todo, onMessage?: OnMessageCallback) {
        let subTask: Todo
        let sub: Todo
        const hasResend = !!(opts.resend || opts.from || opts.to || opts.last)
        const onEnd = () => {
            if (sub && typeof onMessage === 'function') {
                sub.off('message', onMessage)
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

    async unsubscribe(opts: Todo) {
        await this.subscriber.unsubscribe(opts)
    }

    async resend(opts: Todo, onMessage?: OnMessageCallback) {
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

    enableAutoConnect(...args: Todo) {
        return this.connection.enableAutoConnect(...args)
    }

    enableAutoDisconnect(...args: Todo) {
        return this.connection.enableAutoDisconnect(...args)
    }

    getAddress() {
        return this.ethereum.getAddress()
    }

    async getPublisherId() {
        return this.getAddress()
    }

    /**
     * Get token balance in "wei" (10^-18 parts) for given address
     */
    async getTokenBalance(address: EthereumAddress): Promise<BigNumber> {
        const { tokenAddress } = this.options
        if (!tokenAddress) {
            throw new Error('StreamrClient has no tokenAddress configuration.')
        }
        const addr = getAddress(address)
        const provider = this.ethereum.getMainnetProvider()

        const token = new Contract(tokenAddress, [{
            name: 'balanceOf',
            inputs: [{ type: 'address' }],
            outputs: [{ type: 'uint256' }],
            constant: true,
            payable: false,
            stateMutability: 'view',
            type: 'function'
        }], provider)
        return token.balanceOf(addr)
    }

    getDataUnion(contractAddress: EthereumAddress) {
        return DataUnion._fromContractAddress(contractAddress, this) // eslint-disable-line no-underscore-dangle
    }

    async deployDataUnion(options?: DataUnionDeployOptions) {
        return DataUnion._deploy(options, this) // eslint-disable-line no-underscore-dangle
    }

    _getDataUnionFromName({ dataUnionName, deployerAddress }: { dataUnionName: string, deployerAddress: EthereumAddress}) {
        return DataUnion._fromName({ // eslint-disable-line no-underscore-dangle
            dataUnionName,
            deployerAddress
        }, this)
    }

    static generateEthereumAccount() {
        return StreamrEthereum.generateEthereumAccount()
    }
}
