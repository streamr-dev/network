import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { counterId, uuid, CacheAsyncFn } from './utils'
import { validateOptions } from './stream/utils'
import Config, { StreamrClientOptions } from './Config'
import StreamrEthereum from './Ethereum'
import Session from './Session'
import Connection, { ConnectionError } from './Connection'
import Publisher from './publish'
import Subscriber from './subscribe'
import { getUserId } from './user'
import { Todo } from './types'
import { StreamEndpoints, StreamListQuery } from './rest/StreamEndpoints'
import { LoginEndpoints } from './rest/LoginEndpoints'
import { DataUnionEndpoints } from './rest/DataUnionEndpoints'
import { BigNumber } from '@ethersproject/bignumber'
import Stream, { StreamProperties } from './stream'
import { ExternalProvider, JsonRpcFetchFunc } from '@ethersproject/providers'
import { DataUnion, DataUnionDeployOptions } from './dataunion/DataUnion'
import { getAddress } from '@ethersproject/address'

type Function = (...args: any[]) => any // Utility Type: generic function
type Promisify<F extends Function> = (...args: Parameters<F>) => Promise<ReturnType<F>> // Utility Type: make a function async
type MaybeAsync<F extends Function> = F | Promisify<F> // Utility Type: make a function maybe async

// TODO get metadata type from streamr-protocol-js project (it doesn't export the type definitions yet)
export type OnMessageCallback = MaybeAsync<(message: any, metadata: any) => void>

interface MessageEvent {
    data: any
}

export { StreamrClientOptions }

/**
 * Wrap connection message events with message parsing.
 */

class StreamrConnection extends Connection {
    // TODO define args type when we convert Connection class to TypeScript
    constructor(...args: any) {
        super(...args)
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

export default class StreamrClient extends EventEmitter {

    id: string
    debug: Debug.Debugger
    options: StreamrClientOptions
    session: Session
    connection: StreamrConnection
    publisher: Todo
    subscriber: Subscriber
    cached: StreamrCached
    ethereum: StreamrEthereum
    streamEndpoints: StreamEndpoints
    loginEndpoints: LoginEndpoints
    dataUnionEndpoints: DataUnionEndpoints

    constructor(options: Partial<StreamrClientOptions> = {}, connection?: StreamrConnection) {
        super()
        this.id = counterId(`${this.constructor.name}:${uid}`)
        this.debug = Debug(this.id)

        this.options = Config({
            id: this.id,
            debug: this.debug,
            ...options,
        })

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
        this.connection = connection || new StreamrConnection(this.options)

        this.connection
            .on('connected', this.onConnectionConnected)
            .on('disconnected', this.onConnectionDisconnected)
            .on('error', this.onConnectionError)

        // @ts-expect-error
        this.publisher = new Publisher(this)
        this.subscriber = new Subscriber(this)
        this.cached = new StreamrCached(this)
        this.ethereum = new StreamrEthereum(this)

        this.streamEndpoints = new StreamEndpoints(this)
        this.loginEndpoints = new LoginEndpoints(this)
        this.dataUnionEndpoints = new DataUnionEndpoints(this)
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

    getAddress(): string {
        const address = this.ethereum.getAddress()
        if (address) {
            return getAddress(address)
        } else {
            throw new Error('StreamrClient is not authenticated with private key')
        }
    }

    async getPublisherId() {
        return this.getAddress()
    }

    static generateEthereumAccount() {
        return StreamrEthereum.generateEthereumAccount()
    }

    // TODO many of these methods that use streamEndpoints/loginEndpoints/dataUnionEndpoints are private: remove those

    async getStream(streamId: string) {
        return this.streamEndpoints.getStream(streamId)
    }

    async listStreams(query: StreamListQuery = {}) {
        return this.streamEndpoints.listStreams(query)
    }

    async getStreamByName(name: string) {
        return this.streamEndpoints.getStreamByName(name)
    }

    async createStream(props: StreamProperties) {
        return this.streamEndpoints.createStream(props)
    }

    async getOrCreateStream(props: { id?: string, name?: string }) {
        return this.streamEndpoints.getOrCreateStream(props)
    }

    async getStreamPublishers(streamId: string) {
        return this.streamEndpoints.getStreamPublishers(streamId)
    }

    async isStreamPublisher(streamId: string, ethAddress: string) {
        return this.streamEndpoints.isStreamPublisher(streamId, ethAddress)
    }

    async getStreamSubscribers(streamId: string) {
        return this.streamEndpoints.getStreamSubscribers(streamId)
    }

    async isStreamSubscriber(streamId: string, ethAddress: string) {
        return this.streamEndpoints.isStreamSubscriber(streamId, ethAddress)
    }

    async getStreamValidationInfo(streamId: string) {
        return this.streamEndpoints.getStreamValidationInfo(streamId)
    }

    async getStreamLast(streamObjectOrId: Stream|string) {
        return this.streamEndpoints.getStreamLast(streamObjectOrId)
    }

    async getStreamPartsByStorageNode(address: string) {
        return this.streamEndpoints.getStreamPartsByStorageNode(address)
    }

    async publishHttp(streamObjectOrId: Stream|string, data: Todo, requestOptions: Todo = {}, keepAlive: boolean = true) {
        return this.streamEndpoints.publishHttp(streamObjectOrId, data, requestOptions, keepAlive)
    }

    async getUserInfo() {
        return this.loginEndpoints.getUserInfo()
    }

    async getTokenBalance(address: string) {
        return this.dataUnionEndpoints.getTokenBalance(address)
    }

    getDataUnion(contractAddress: string) {
        return new DataUnion(contractAddress, undefined, this.dataUnionEndpoints)
    }

    async deployDataUnion(options?: DataUnionDeployOptions) {
        const contract = await this.dataUnionEndpoints.deployDataUnion(options)
        return new DataUnion(contract.address, contract.sidechain.address, this.dataUnionEndpoints)
    }

    _getDataUnionFromName({ dataUnionName, deployerAddress }: { dataUnionName: string, deployerAddress: string}) {
        const contractAddress = this.dataUnionEndpoints.calculateDataUnionMainnetAddress(dataUnionName, deployerAddress)
        return this.getDataUnion(contractAddress)
    }
}
