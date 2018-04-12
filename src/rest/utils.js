const fetch = require('node-fetch')
const debug = require('debug')('StreamrClient:utils')

module.exports = {
    async authFetch(url, apiKey, opts = {}) {
        debug('authFetch: ', url, opts)

        const req = Object.assign({}, opts, {
            headers: apiKey ? {
                Authorization: `token ${apiKey}`,
            } : undefined,
        })

        const res = await fetch(url, req)

        const text = await res.text()

        if (res.ok && text.length) {
            try {
                return JSON.parse(text)
            } catch (err) {
                throw new Error(`Failed to parse JSON response: ${text}`)
            }
        } else if (res.ok) {
            return {}
        } else {
            throw new Error(`Request to ${url} returned with error code ${res.status}: ${text}`)
        }
    },
}
