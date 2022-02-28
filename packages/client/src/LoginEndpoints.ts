/**
 * Login Endpoints Wrapper.
 */
import { scoped, Lifecycle, inject, delay } from 'tsyringe'
import Ethereum, { AuthConfig } from './Ethereum'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import { Config } from './Config'
import { Rest } from './Rest'
import { EthereumAddress } from 'streamr-client-protocol'

export interface TokenObject {
    token: string
}

export interface UserDetails {
    name: string
    username: string
    imageUrlSmall?: string
    imageUrlLarge?: string
    lastLogin?: string
}

@scoped(Lifecycle.ContainerScoped)
export class LoginEndpoints implements Context {
    id
    debug
    constructor(
        context: Context,
        private ethereum: Ethereum,
        @inject(delay(() => Rest)) private rest: Rest,
        @inject(Config.Auth) private authConfig: AuthConfig,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /** @internal */
    async getChallenge(address: EthereumAddress) {
        this.debug('getChallenge %o', {
            address,
        })
        return this.rest.post<{ challenge: string }>(['login', 'challenge', address], undefined, { useSession: false })
    }

    /** @internal */
    async sendChallengeResponse(challenge: { challenge: string }, signature: string, address: EthereumAddress) {
        const props = {
            challenge,
            signature,
            address,
        }
        this.debug('sendChallengeResponse %o', props)
        return this.rest.post<TokenObject>(['login', 'response'], props, { useSession: false })
    }

    /** @internal */
    async loginWithChallengeResponse() {
        const address = await this.ethereum.getAddress()
        this.debug('loginWithChallengeResponse')
        const challenge = await this.getChallenge(address)
        const signature = await this.ethereum.getSigner().signMessage(challenge.challenge)
        return this.sendChallengeResponse(challenge, signature, address)
    }

    async getUserInfo() {
        this.debug('getUserInfo')
        return this.rest.get<UserDetails>(['users', 'me'])
    }

    /** @internal */
    async logoutEndpoint(): Promise<void> {
        this.debug('logoutEndpoint')
        await this.rest.post(['logout'])
    }
}

