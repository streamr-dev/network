const Web3 = require('web3')

const web3 = new Web3()

export default class Session {
    constructor(client, options) {
        this._client = client
        this.options = options || {}
        this.state = Session.State.LOGGED_OUT

        if (this.options.privateKey) {
            const account = web3.eth.accounts.privateKeyToAccount(this.options.privateKey)
            this.loginFunction = async () => this._client.loginWithChallengeResponse((d) => account.sign(d).signature, account.address)
        } else if (this.options.provider) {
            const w3 = new Web3(this.options.provider)
            this.loginFunction = async () => {
                const accounts = await w3.eth.getAccounts()
                const address = accounts[0]
                if (!address) {
                    throw new Error('Cannot access account from provider')
                }
                return this._client.loginWithChallengeResponse((d) => w3.eth.personal.sign(d, address), address)
            }
        } else if (this.options.apiKey) {
            this.loginFunction = async () => this._client.loginWithApiKey(this.options.apiKey)
        } else if (this.options.username && this.options.password) {
            this.loginFunction = async () => this._client.loginWithUsernamePassword(this.options.username, this.options.password)
        } else {
            this.loginFunction = async () => {
                throw new Error('Need either "privateKey", "apiKey" or "username"+"password" to login.')
            }
        }
    }

    async getSessionToken(requireNewToken = false) {
        if (this.options.sessionToken && !requireNewToken) {
            return this.options.sessionToken
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
