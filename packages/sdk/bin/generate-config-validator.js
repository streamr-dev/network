/**
 * This script generates a client config AJV validation function to avoid
 * having to compile it during run time which requires the use of `eval`.
 * Use of `eval` is not allowed e.g. in Chrome plugins.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable import/no-extraneous-dependencies */

const fs = require('fs')
const path = require('path')
const Ajv = require('ajv')
const standaloneCode = require('ajv/dist/standalone').default
const { fastFormats, fullFormats } = require('ajv-formats/dist/formats')
const CONFIG_SCHEMA = require('../src/config.schema.json')

const ajv = new Ajv({
    useDefaults: true,
    code: {
        source: true
    }
})
// addFormats(ajv) does not work properly when generating stand-alone code
// (https://github.com/ajv-validator/ajv-formats/issues/68) so adding formats one-by-one
ajv.addFormat('uri', fastFormats.uri)
ajv.addFormat('ipv4', fullFormats.ipv4)
ajv.addFormat('hostname', fullFormats.hostname)
ajv.addFormat('ethereum-address', /^0x[a-zA-Z0-9]{40}$/)
ajv.addFormat('ethereum-private-key', /^(0x)?[a-zA-Z0-9]{64}$/)

const validate = ajv.compile(CONFIG_SCHEMA)
const moduleCode = standaloneCode(ajv, validate)
fs.writeFileSync(path.join(__dirname, '../src/generated/validateConfig.js'), moduleCode)
