#!/usr/bin/env node
//
// Generates a private key that is compatible with libp2p
//
const crypto = require('libp2p-crypto')

crypto.keys.generateKeyPair('RSA', 2048, (err, key) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(key.bytes.toString('base64'))
})

