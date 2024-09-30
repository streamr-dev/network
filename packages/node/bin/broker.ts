#!/usr/bin/env node
import { Logger } from '@streamr/utils'

// TODO: remove this file and the package.json entry in the future
// eslint-disable-next-line max-len
const deprecationMessage = 'The command "streamr-broker" is deprecated and will be removed in the future. Please switch to command "streamr-node" instead.'
console.warn(deprecationMessage)
new Logger(module).warn(deprecationMessage)

// side-effect: runs the command
import './streamr-node'
