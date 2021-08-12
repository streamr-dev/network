import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import EventEmitter from 'eventemitter3'
import { LoginEndpoints, TokenObject } from './LoginEndpoints'
import { AuthConfig } from './Ethereum'
import { Config } from './Config'
import { BrubeckContainer } from './Container'

enum State {
    LOGGING_OUT = 'logging out',
    LOGGED_OUT = 'logged out',
    LOGGING_IN ='logging in',
    LOGGED_IN = 'logged in',
}

@scoped(Lifecycle.ContainerScoped)
export default class Session extends EventEmitter {
    state: State
    sessionTokenPromise?: Promise<string|undefined>

    constructor(
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Config.Auth) public options: AuthConfig
    ) {
        super()
        this.state = State.LOGGED_OUT
    }

    isUnauthenticated() {
        return !!this.options.unauthenticated
    }

    updateState(newState: State) {
        this.state = newState
        this.emit(newState)
    }

    get loginEndpoints() {
        return this.container.resolve<LoginEndpoints>(LoginEndpoints)
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
                this.sessionTokenPromise = this.loginEndpoints.sendLogin().then((tokenObj: TokenObject) => {
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
