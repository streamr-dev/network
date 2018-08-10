'use strict'

const EventEmitter = require('events').EventEmitter
const Buffer = require('safe-buffer').Buffer;
const ms = require('ms');
const pVersion = require('../package.json').version;
const os = require('os');
const debug = require('debug')
const Node = require('./peer').Node

const log = debug('strmrp2p:tracker')

class Tracker extends Node {
    constructor(options) {
        super(options)

        this._timeout = options.timeout || ms('10s');

        this._clientId = Buffer.from(options.clientId || `strmr-net/v${pVersion}/${os.platform()}-${os.arch()}/nodejs`);
        this._remoteClientIdFilter = options.remoteClientIdFilter;
        
        log(`tracker started at ${this._host}:${this._port}`)
    }

    getPeers() {
        return this._node.peerBook.getAllArray()
    }
}

module.exports = Tracker;