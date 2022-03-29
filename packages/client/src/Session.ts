/**
 * Session token caching and async init.
 */
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import EventEmitter from 'eventemitter3'

import { LoginEndpoints, TokenObject } from './LoginEndpoints'
import { AuthConfig } from './Ethereum'
import { ConfigInjectionToken } from './Config'
import { BrubeckContainer } from './Container'
import { Debug } from './utils/log'

const debug = Debug('Session')

enum State {
    LOGGING_OUT = 'logging out',
    LOGGED_OUT = 'logged out',
    LOGGING_IN ='logging in',
    LOGGED_IN = 'logged in',
}

@scoped(Lifecycle.ContainerScoped)
export default class Session {
    private state: State
    private sessionTokenPromise?: Promise<string>
    private eventEmitter: EventEmitter<State>

    constructor(
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(ConfigInjectionToken.Auth) private options: AuthConfig
    ) {
        this.state = State.LOGGED_OUT
        this.options = options
        this.eventEmitter = new EventEmitter<State>()
        if (!this.options.sessionToken) {
            this.options.unauthenticated = true
        }
    }

    /** @internal */
    isUnauthenticated() {
        return !this.options.privateKey && !this.options.ethereum && !this.options.sessionToken
    }

    private updateState(newState: State) {
        debug('updateState %s -> %s', this.state, newState)
        this.state = newState
        this.eventEmitter.emit(newState)
    }

    private get loginEndpoints() {
        return this.container.resolve<LoginEndpoints>(LoginEndpoints)
    }

    /** @internal */
    async sendLogin(): Promise<TokenObject> {
        const auth = this.options
        debug('sendLogin()')
        if (typeof auth.privateKey !== 'undefined' || typeof auth.ethereum !== 'undefined') {
            debug('sendLogin challenge')
            return this.loginEndpoints.loginWithChallengeResponse()
        }

        throw new Error('Need either "privateKey", "ethereum" or "sessionToken" to login.')
    }

    /** @internal */
    async getSessionToken(requireNewToken = false): Promise<string> {
        // @ts-expect-error
        if (typeof this.options.apiKey !== 'undefined') {
            throw new Error('apiKey auth no longer supported')
        }

        // @ts-expect-error
        if (typeof this.options.username !== 'undefined') {
            throw new Error('username/password auth no longer supported')
        }

        if (this.options.sessionToken && !requireNewToken) {
            return this.options.sessionToken
        }

        if (!this.options.privateKey && !this.options.ethereum && !this.options.sessionToken) {
            return ''
        }

        if (this.state !== State.LOGGING_IN) {
            if (this.state === State.LOGGING_OUT) {
                this.sessionTokenPromise = new Promise((resolve) => {
                    this.eventEmitter.once(State.LOGGED_OUT, () => resolve(this.getSessionToken(requireNewToken)))
                })
            } else {
                this.updateState(State.LOGGING_IN)
                this.sessionTokenPromise = this.sendLogin().then((tokenObj: TokenObject) => {
                    this.options.sessionToken = tokenObj.token
                    this.updateState(State.LOGGED_IN)
                    return tokenObj.token
                }, (err: Error) => {
                    this.updateState(State.LOGGED_OUT)
                    throw err
                })
            }
        }

        return this.sessionTokenPromise!
    }

    /** @internal */
    async logout() {
        if (this.state === State.LOGGED_OUT) {
            throw new Error('Already logged out!')
        }

        if (this.state === State.LOGGING_OUT) {
            throw new Error('Already logging out!')
        }

        if (this.state === State.LOGGING_IN) {
            await new Promise((resolve) => {
                this.eventEmitter.once(State.LOGGED_IN, () => resolve(this.logout()))
            })
            return
        }

        try {
            this.updateState(State.LOGGING_OUT)
            const t = this.loginEndpoints.logoutEndpoint()
            this.options.sessionToken = undefined
            this.sessionTokenPromise = undefined
            await t
        } finally {
            this.updateState(State.LOGGED_OUT)
        }
    }
}
