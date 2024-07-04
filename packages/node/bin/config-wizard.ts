#!/usr/bin/env node

// TODO: remove this file and the package.json entry in the future
// eslint-disable-next-line max-len
const deprecationMessage = 'The command "streamr-broker-init" is deprecated and will be removed in the future. Please switch to command "streamr-node-init" instead.'
console.warn(deprecationMessage)

// side-effect: runs the command
import './streamr-node-init'
