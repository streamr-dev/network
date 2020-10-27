import { getEndpointUrl } from '../utils'
import AuthFetchError from '../errors/AuthFetchError'

import authFetch from './authFetch'

async function getSessionToken(url, props) {
    return authFetch(
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

export async function getChallenge(address) {
    this.debug('getChallenge %o', {
        address,
    })
    const url = getEndpointUrl(this.options.restUrl, 'login', 'challenge', address)
    return authFetch(
        url,
        undefined,
        {
            method: 'POST',
        },
    )
}

export async function sendChallengeResponse(challenge, signature, address) {
    this.debug('sendChallengeResponse %o', {
        challenge,
        signature,
        address,
    })
    const url = getEndpointUrl(this.options.restUrl, 'login', 'response')
    const props = {
        challenge,
        signature,
        address,
    }
    return getSessionToken(url, props)
}

export async function loginWithChallengeResponse(signingFunction, address) {
    this.debug('loginWithChallengeResponse &o', {
        address,
    })
    const challenge = await this.getChallenge(address)
    const signature = await signingFunction(challenge.challenge)
    return this.sendChallengeResponse(challenge, signature, address)
}

export async function loginWithApiKey(apiKey) {
    this.debug('loginWithApiKey %o', {
        apiKey,
    })
    const url = getEndpointUrl(this.options.restUrl, 'login', 'apikey')
    const props = {
        apiKey,
    }
    return getSessionToken(url, props)
}

export async function loginWithUsernamePassword(username, password) {
    this.debug('loginWithUsernamePassword %o', {
        username,
    })
    const url = getEndpointUrl(this.options.restUrl, 'login', 'password')
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

export async function getUserInfo() {
    this.debug('getUserInfo')
    return authFetch(`${this.options.restUrl}/users/me`, this.session)
}

export async function logoutEndpoint() {
    this.debug('logoutEndpoint')
    return authFetch(`${this.options.restUrl}/logout`, this.session, {
        method: 'POST',
    })
}
