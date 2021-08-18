/**
 * Session token caching and async init.
 */
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import EventEmitter from 'eventemitter3'

import { LoginEndpoints, TokenObject } from './LoginEndpoints'
import { AuthConfig } from './Ethereum'
import { Config } from './Config'
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
export default class Session extends EventEmitter {
    state: State
    sessionTokenPromise?: Promise<string>

    constructor(
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Config.Auth) public options: AuthConfig
    ) {
        super()
        this.state = State.LOGGED_OUT
        this.options = options
        if (!this.options.sessionToken) {
            this.options.unauthenticated = true
        }
        debug('options', this.options)
    }

    isUnauthenticated() {
        return !this.options.privateKey && !this.options.ethereum && !this.options.sessionToken
    }

    updateState(newState: State) {
        debug('updateState %s -> %s', this.state, newState)
        this.state = newState
        this.emit(newState)
    }

    get loginEndpoints() {
        return this.container.resolve<LoginEndpoints>(LoginEndpoints)
    }

    async sendLogin(): Promise<TokenObject> {
        const auth = this.options
        debug('sendLogin()')
        if (typeof auth.privateKey !== 'undefined' || typeof auth.ethereum !== 'undefined') {
            debug('sendLogin challenge')
            return this.loginEndpoints.loginWithChallengeResponse()
        }

        throw new Error('Need either "privateKey", "ethereum" or "sessionToken" to login.')
    }

    async getSessionToken(requireNewToken = false): Promise<string> {
        if (this.options.sessionToken && !requireNewToken) {
            return this.options.sessionToken
        }

        if (!this.options.privateKey && !this.options.ethereum && !this.options.sessionToken) {
            return ''
        }

        if (this.state !== State.LOGGING_IN) {
            if (this.state === State.LOGGING_OUT) {
                this.sessionTokenPromise = new Promise((resolve) => {
                    this.once(State.LOGGED_OUT, () => resolve(this.getSessionToken(requireNewToken)))
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
