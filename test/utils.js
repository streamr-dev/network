const crypto = require('crypto')

const uniqueId = require('lodash.uniqueid')

export const uid = (prefix) => uniqueId(`p${process.pid}${prefix ? '-' + prefix : ''}`)

export function fakePrivateKey() {
    return crypto.randomBytes(32).toString('hex')
}
