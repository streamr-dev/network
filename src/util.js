'use strict';

const { randomBytes } = require('crypto')
const secp256k1 = require('secp256k1');
const debug = require('debug')
const log = debug('strmrp2p:util')

function genPrivateKey() {
    while (true) {
      const privateKey = randomBytes(32);
      if (secp256k1.privateKeyVerify(privateKey)) {
          return privateKey;
      }
    }
}

function pk2id(pk) {
    if (pk.length === 33) pk = secp256k1.publicKeyConvert(pk, false);
    return pk.slice(1);
  }
  
  function id2pk(id) {
    return Buffer.concat([Buffer.from([0x04]), id]);
  }

module.exports = {
    genPrivateKey,
    pk2id,
    id2pk
};