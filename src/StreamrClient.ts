import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { counterId, uuid, CacheAsyncFn } from './utils'
import { validateOptions } from './stream/utils'
import Config from './Config'
import StreamrEthereum from './Ethereum'
import Session from './Session'
import Connection, { ConnectionError } from './Connection'
import Publisher from './publish'
import Subscriber from './subscribe'
import { getUserId } from './user'
import { Todo } from './types'
import { StreamEndpoints, StreamListQuery } from './rest/StreamEndpoints'
import { LoginEndpoints } from './rest/LoginEndpoints'
import { DataUnionEndpoints, DataUnionOptions } from './rest/DataUnionEndpoints'
import { BigNumber } from '@ethersproject/bignumber'
import Stream, { StreamProperties } from './stream'
import { ExternalProvider, JsonRpcFetchFunc } from '@ethersproject/providers'

export interface StreamrClientOptions {
    id?: string
    debug?: Debug.Debugger,
    auth?: {
        privateKey?: string
        ethereum?: ExternalProvider|JsonRpcFetchFunc,
        apiKey?: string
        username?: string
        password?: string
    }
    url?: string
    restUrl?: string
    streamrNodeAddress?: string
    autoConnect?: boolean
    autoDisconnect?: boolean
    orderMessages?: boolean,
    retryResendAfter?: number,
    gapFillTimeout?: number,
    maxPublishQueueSize?: number,
    publishWithSignature?: Todo,
    verifySignatures?: Todo,
    publisherStoreKeyHistory?: boolean,
    groupKeys?: Todo
    keyExchange?: Todo
    mainnet?: Todo
    sidechain?: {
        url?: string
    },
    dataUnion?: string
    tokenAddress?: string,
    minimumWithdrawTokenWei?: BigNumber|number|string,
    sidechainTokenAddress?: string
    factoryMainnetAddress?: string
    sidechainAmbAddress?: string
    payForSignatureTransport?: boolean
    cache?: {
        maxSize?: number,
        maxAge?: number
    }
}

// TODO get metadata type from streamr-protocol-js project (it doesn't export the type definitions yet)
export type OnMessageCallback = (message: any, metadata: any) => void

interface MessageEvent {
    data: any
}

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

    constructor(options: StreamrClientOptions = {}, connection?: StreamrConnection) {
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

    getAddress() {
        return this.ethereum.getAddress()
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

    async calculateDataUnionMainnetAddress(dataUnionName: string, deployerAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.calculateDataUnionMainnetAddress(dataUnionName, deployerAddress, options)
    }

    async calculateDataUnionSidechainAddress(duMainnetAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.calculateDataUnionSidechainAddress(duMainnetAddress, options)
    }

    async deployDataUnion(options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.deployDataUnion(options)
    }

    async getDataUnionContract(options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.getDataUnionContract(options)
    }

    async createSecret(dataUnionMainnetAddress: string, name: string = 'Untitled Data Union Secret') {
        return this.dataUnionEndpoints.createSecret(dataUnionMainnetAddress, name)
    }

    async kick(memberAddressList: string[], options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.kick(memberAddressList, options)
    }

    async addMembers(memberAddressList: string[], options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.addMembers(memberAddressList, options)
    }

    async withdrawMember(memberAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.withdrawMember(memberAddress, options)
    }

    async getWithdrawMemberTx(memberAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawMemberTx(memberAddress, options)
    }

    async withdrawToSigned(memberAddress: string, recipientAddress: string, signature: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.withdrawToSigned(memberAddress, recipientAddress, signature, options)
    }

    async getWithdrawToSignedTx(memberAddress: string, recipientAddress: string, signature: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawToSignedTx(memberAddress, recipientAddress, signature, options)
    }

    async setAdminFee(newFeeFraction: number, options: DataUnionOptions) {
        return this.dataUnionEndpoints.setAdminFee(newFeeFraction, options)
    }

    async getAdminFee(options: DataUnionOptions) {
        return this.dataUnionEndpoints.getAdminFee(options)
    }

    async getAdminAddress(options: DataUnionOptions) {
        return this.dataUnionEndpoints.getAdminAddress(options)
    }

    async joinDataUnion(options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.joinDataUnion(options)
    }

    async hasJoined(memberAddress: string, options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.hasJoined(memberAddress, options)
    }

    async getMembers(options: DataUnionOptions) {
        return this.dataUnionEndpoints.getMembers(options)
    }

    async getDataUnionStats(options: DataUnionOptions) {
        return this.dataUnionEndpoints.getDataUnionStats(options)
    }

    async getMemberStats(memberAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.getMemberStats(memberAddress, options)
    }

    async getMemberBalance(memberAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.getMemberBalance(memberAddress, options)
    }

    async getTokenBalance(address: string|null|undefined, options: DataUnionOptions) {
        return this.dataUnionEndpoints.getTokenBalance(address, options)
    }

    async getDataUnionVersion(contractAddress: string) {
        return this.dataUnionEndpoints.getDataUnionVersion(contractAddress)
    }

    async withdraw(options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.withdraw(options)
    }

    async getWithdrawTx(options: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawTx(options)
    }

    async withdrawTo(recipientAddress: string, options: DataUnionOptions = {}) {
        return this.dataUnionEndpoints.withdrawTo(recipientAddress, options)
    }

    async getWithdrawTxTo(recipientAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawTxTo(recipientAddress, options)
    }

    async signWithdrawTo(recipientAddress: string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.signWithdrawTo(recipientAddress, options)
    }

    async signWithdrawAmountTo(recipientAddress: string, amountTokenWei: BigNumber|number|string, options: DataUnionOptions) {
        return this.dataUnionEndpoints.signWithdrawAmountTo(recipientAddress, amountTokenWei, options)
    }
}
