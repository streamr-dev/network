import { ethers } from 'ethers'

export default class Session {
    constructor(client, options) {
        this._client = client
        this.options = options || {}
        this.state = Session.State.LOGGED_OUT

        if (typeof this.options.privateKey !== 'undefined') {
            const wallet = new ethers.Wallet(this.options.privateKey)
            this.loginFunction = async () => this._client.loginWithChallengeResponse((d) => wallet.signMessage(d), wallet.address)
        } else if (typeof this.options.provider !== 'undefined') {
            const provider = new ethers.providers.Web3Provider(this.options.provider)
            const signer = provider.getSigner()
            this.loginFunction = async () => this._client.loginWithChallengeResponse((d) => signer.signMessage(d), await signer.getAddress())
        } else if (typeof this.options.apiKey !== 'undefined') {
            this.loginFunction = async () => this._client.loginWithApiKey(this.options.apiKey)
        } else if (typeof this.options.username !== 'undefined' && typeof this.options.password !== 'undefined') {
            this.loginFunction = async () => this._client.loginWithUsernamePassword(this.options.username, this.options.password)
        } else {
            if (!this.options.sessionToken) {
                this.options.unauthenticated = true
            }
            this.loginFunction = async () => {
                throw new Error('Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to login.')
            }
        }
    }

    async getSessionToken(requireNewToken = false) {
        if (this.options.sessionToken && !requireNewToken) {
            return this.options.sessionToken
        }
        if (this.options.unauthenticated) {
            return undefined
        }
        if (this.state !== Session.State.LOGGING_IN) {
            this.state = Session.State.LOGGING_IN
            this.sessionTokenPromise = this.loginFunction().then((tokenObj) => {
                this.options.sessionToken = tokenObj.token
                this.state = Session.State.LOGGED_IN
                return tokenObj.token
            }).catch((err) => {
                this.state = Session.State.LOGGED_OUT
                throw err
            })
        }
        return this.sessionTokenPromise
    }
}

Session.State = {
    LOGGED_OUT: 'logged out',
    LOGGING_IN: 'logging in',
    LOGGED_IN: 'logged in',
}
