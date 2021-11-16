import pino from 'pino'
import pinoPretty from 'pino-pretty'
import path from 'path'
import _ from 'lodash'

import { LoggerCommon } from './LoggerCommon'

const parseBoolean = (value: string|undefined) => {
    switch (value) {
        case 'true':
            return true
        case 'false':
            return false
        case undefined:
            return undefined
        default:
            throw new Error('Invalid boolean value: ${value}')
    }
}

export class LoggerNode extends LoggerCommon {
    static NAME_LENGTH = 20

    constructor(module: NodeJS.Module, context?: string, destinationStream?: { write(msg: string): void }) {
        const options: pino.LoggerOptions = {
            name: LoggerNode.createName(module, context),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info',
            // explicitly pass prettifier, otherwise pino may try to lazy require it,
            // which can fail when under jest+typescript, due to some CJS/ESM
            // incompatibility leading to throwing an error like:
            // "prettyFactory is not a function"
            prettifier: process.env.NODE_ENV === 'production' ? undefined : pinoPretty,
            prettyPrint: process.env.NODE_ENV === 'production' ? false : {
                colorize: parseBoolean(process.env.LOG_COLORS) ?? true,
                translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
                ignore: 'pid,hostname',
                levelFirst: true,
            }
        }
        super(options, destinationStream)
    }

    private static createName(module: NodeJS.Module, context?: string) {
        const parsedPath = path.parse(module.id)
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const appId = process.env.STREAMR_APPLICATION_ID
        const longName = _.without([appId, fileId, context], undefined).join(':')
        return _.padEnd(longName.substring(0, LoggerNode.NAME_LENGTH), LoggerNode.NAME_LENGTH, ' ')
    }
}

export { LoggerNode as Logger }
