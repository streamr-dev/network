import EventEmitter from 'eventemitter3'
import { Wallet } from '@ethersproject/wallet'
import { ExternalProvider, JsonRpcFetchFunc, Web3Provider } from '@ethersproject/providers'
import { StreamrClient } from './StreamrClient'
import { BytesLike } from '@ethersproject/bytes'

enum State {
    LOGGING_OUT = 'logging out',
    LOGGED_OUT = 'logged out',
    LOGGING_IN ='logging in',
    LOGGED_IN = 'logged in',
}

export interface SessionOptions {
    privateKey?: string|BytesLike
    ethereum?: ExternalProvider|JsonRpcFetchFunc
    apiKey?: string
    username?: string
    password?: string
    sessionToken?: string
    unauthenticated?: boolean
}

interface TokenObject {
    token: string
}

/** @internal */
export default class Session extends EventEmitter {

    _client: StreamrClient
    options: SessionOptions
    state: State
    loginFunction: () => Promise<TokenObject>
    sessionTokenPromise?: Promise<string|undefined>

    constructor(client: StreamrClient, options: SessionOptions = {}) {
        super()
        this._client = client
        this.options = {
            ...options
        }

        this.state = State.LOGGED_OUT

        // TODO: move loginFunction to StreamrClient constructor where "auth type" is checked
        if (typeof this.options.privateKey !== 'undefined') {
            const wallet = new Wallet(this.options.privateKey)
            this.loginFunction = async () => (
                this._client.loginEndpoints.loginWithChallengeResponse((d: string) => wallet.signMessage(d), wallet.address)
            )
        } else if (typeof this.options.ethereum !== 'undefined') {
            const provider = new Web3Provider(this.options.ethereum)
            const signer = provider.getSigner()
            this.loginFunction = async () => (
                this._client.loginEndpoints.loginWithChallengeResponse((d: string) => signer.signMessage(d), await signer.getAddress())
            )
        } else if (typeof this.options.apiKey !== 'undefined') {
            this.loginFunction = async () => (
                this._client.loginEndpoints.loginWithApiKey(this.options.apiKey!)
            )
        } else if (typeof this.options.username !== 'undefined' && typeof this.options.password !== 'undefined') {
            this.loginFunction = async () => (
                this._client.loginEndpoints.loginWithUsernamePassword(this.options.username!, this.options.password!)
            )
        } else {
            if (!this.options.sessionToken) {
                this.options.unauthenticated = true
            }
            this.loginFunction = async () => {
                throw new Error('Need either "privateKey", "ethereum", "apiKey", "username"+"password" or "sessionToken" to login.')
            }
        }
    }

    isUnauthenticated() {
        return this.options.unauthenticated
    }

    updateState(newState: State) {
        this.state = newState
        this.emit(newState)
    }

    async getSessionToken(requireNewToken = false) {
        if (this.options.sessionToken && !requireNewToken) {
            return this.options.sessionToken
        }

        if (this.options.unauthenticated) {
            return undefined
        }

        if (this.state !== State.LOGGING_IN) {
            if (this.state === State.LOGGING_OUT) {
                this.sessionTokenPromise = new Promise((resolve) => {
                    this.once(State.LOGGED_OUT, () => resolve(this.getSessionToken(requireNewToken)))
                })
            } else {
                this.updateState(State.LOGGING_IN)
                this.sessionTokenPromise = this.loginFunction().then((tokenObj: TokenObject) => {
                    this.options.sessionToken = tokenObj.token
                    this.updateState(State.LOGGED_IN)
                    return tokenObj.token
                }, (err: Error) => {
                    this.updateState(State.LOGGED_OUT)
                    throw err
                })
            }
        }
        return this.sessionTokenPromise
    }

    async logout() {
        if (this.state === State.LOGGED_OUT) {
            throw new Error('Already logged out!')
        }

        if (this.state === State.LOGGING_OUT) {
            throw new Error('Already logging out!')
        }

        if (this.state === State.LOGGING_IN) {
            await new Promise((resolve) => {
                this.once(State.LOGGED_IN, () => resolve(this.logout()))
            })
            return
        }

        this.updateState(State.LOGGING_OUT)
        await this._client.loginEndpoints.logoutEndpoint()
        this.options.sessionToken = undefined
        this.updateState(State.LOGGED_OUT)
    }
}
