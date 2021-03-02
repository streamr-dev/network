import StreamrClient from '../StreamrClient'
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

export class LoginEndpoints {

    client: StreamrClient

    constructor(client: StreamrClient) {
        this.client = client
    }

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

    async loginWithChallengeResponse(signingFunction: (challenge: string) => Promise<string>, address: string) {
        this.client.debug('loginWithChallengeResponse %o', {
            address,
        })
        const challenge = await this.getChallenge(address)
        const signature = await signingFunction(challenge.challenge)
        return this.sendChallengeResponse(challenge, signature, address)
    }

    async loginWithApiKey(apiKey: string) {
        this.client.debug('loginWithApiKey %o', {
            apiKey,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'login', 'apikey')
        const props = {
            apiKey,
        }
        return getSessionToken(url, props)
    }

    async loginWithUsernamePassword(username: string, password: string) {
        this.client.debug('loginWithUsernamePassword %o', {
            username,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'login', 'password')
        const props = {
            username,
            password,
        }
        try {
            return await getSessionToken(url, props)
        } catch (err) {
            if (err && err.response && err.response.status === 404) {
                // this 404s if running against new backend with username/password support removed
                // wrap with appropriate error message
                const message = 'username/password auth is no longer supported. Please create an ethereum identity.'
                throw new AuthFetchError(message, err.response, err.body)
            }
            throw err
        }
    }

    async getUserInfo() {
        this.client.debug('getUserInfo')
        return authFetch<UserDetails>(`${this.client.options.restUrl}/users/me`, this.client.session)
    }

    async logoutEndpoint(): Promise<void> {
        this.client.debug('logoutEndpoint')
        await authFetch(`${this.client.options.restUrl}/logout`, this.client.session, {
            method: 'POST',
        })
    }
}
