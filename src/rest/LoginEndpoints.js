import { authFetch } from './utils'

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
    const url = `${this.options.restUrl}/login/challenge/${address}`
    return authFetch(
        url,
        undefined,
        {
            method: 'POST',
        },
    )
}

export async function sendChallengeResponse(challenge, signature, address) {
    const url = `${this.options.restUrl}/login/response`
    const props = {
        challenge,
        signature,
        address,
    }
    return getSessionToken(url, props)
}

export async function loginWithChallengeResponse(signingFunction, address) {
    const challenge = await this.getChallenge(address)
    const signature = await signingFunction(challenge.challenge)
    return this.sendChallengeResponse(challenge, signature, address)
}

export async function loginWithApiKey(apiKey) {
    const url = `${this.options.restUrl}/login/apikey`
    const props = {
        apiKey,
    }
    return getSessionToken(url, props)
}

export async function loginWithUsernamePassword(username, password) {
    const url = `${this.options.restUrl}/login/password`
    const props = {
        username,
        password,
    }
    return getSessionToken(url, props)
}

export async function getUserInfo() {
    return authFetch(`${this.options.restUrl}/users/me`, this.session)
}
