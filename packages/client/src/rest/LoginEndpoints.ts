import { StreamrClient } from '../StreamrClient'
import { getEndpointUrl } from '../utils'

import authFetch, { AuthFetchError } from './authFetch'

export interface UserDetails {
    name: string
    username: string
    imageUrlSmall?: string
    imageUrlLarge?: string
    lastLogin?: string
}

async function getSessionToken(url: string, props: any) {
    return authFetch<{ token: string }>(
        url,
        undefined,
        {
            method: 'POST',
            body: JSON.stringify(props),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
}

/** TODO the class should be annotated with at-internal, but adding the annotation hides the methods */
export class LoginEndpoints {

    /** @internal */
    readonly client: StreamrClient

    constructor(client: StreamrClient) {
        this.client = client
    }

    /** @internal */
    async getChallenge(address: string) {
        this.client.debug('getChallenge %o', {
            address,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'login', 'challenge', address)
        return authFetch<{ challenge: string }>(
            url,
            undefined,
            {
                method: 'POST',
            },
        )
    }

    /** @internal */
    async sendChallengeResponse(challenge: { challenge: string }, signature: string, address: string) {
        this.client.debug('sendChallengeResponse %o', {
            challenge,
            signature,
            address,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'login', 'response')
        const props = {
            challenge,
            signature,
            address,
        }
        return getSessionToken(url, props)
    }

    /** @internal */
    async loginWithChallengeResponse(signingFunction: (challenge: string) => Promise<string>, address: string) {
        this.client.debug('loginWithChallengeResponse %o', {
            address,
        })
        const challenge = await this.getChallenge(address)
        const signature = await signingFunction(challenge.challenge)
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
        this.client.debug('getUserInfo')
        return authFetch<UserDetails>(`${this.client.options.restUrl}/users/me`, this.client.session)
    }

    /** @internal */
    async logoutEndpoint(): Promise<void> {
        this.client.debug('logoutEndpoint')
        await authFetch(`${this.client.options.restUrl}/logout`, this.client.session, {
            method: 'POST',
        })
    }
}
