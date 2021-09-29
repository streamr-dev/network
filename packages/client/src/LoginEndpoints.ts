/**
 * Login Endpoints Wrapper.
 */
import { scoped, Lifecycle, inject, delay } from 'tsyringe'
import Ethereum, { AuthConfig } from './Ethereum'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import { Config } from './Config'
import { Rest } from './Rest'

import { AuthFetchError } from './authFetch'

export interface UserDetails {
     name: string
     username: string
     imageUrlSmall?: string
     imageUrlLarge?: string
     lastLogin?: string
 }

export interface TokenObject {
     token: string
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
     async getChallenge(address: string) {
         this.debug('getChallenge %o', {
             address,
         })
         return this.rest.post<{ challenge: string }>(['login', 'challenge', address], undefined, { useSession: false })
     }

     /** @internal */
     async sendChallengeResponse(challenge: { challenge: string }, signature: string, address: string) {
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

     /** @internal */
     // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
     async loginWithApiKey(_apiKey: string): Promise<any> {
         const message = 'apiKey auth is no longer supported. Please create an ethereum identity.'
         throw new AuthFetchError(message)
     }

     /** @internal */
     // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
     async loginWithUsernamePassword(_username: string, _password: string): Promise<any> {
         const message = 'username/password auth is no longer supported. Please create an ethereum identity.'
         throw new AuthFetchError(message)
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

