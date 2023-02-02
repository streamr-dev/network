import { StreamrClientConfig } from 'streamr-client'
import path from 'path'
import * as os from 'os'
import { camelCase, set } from 'lodash'

export interface Config {
    client: StreamrClientConfig
    httpServer?: {
        port: number
        sslCertificate?: {
            privateKeyFileName: string
            certFileName: string
        }
    }
    apiAuthentication?: {
        keys: string[]
    }
    plugins: Record<string, any>
}

export interface ConfigFile extends Config {
    $schema?: string
}

export interface ConfigFile extends Config {
    $schema?: string
}

export const getDefaultFile = (): string => {
    const relativePath = '.streamr/config/default.json'
    return path.join(os.homedir(), relativePath)
}

export const getLegacyDefaultFile = (): string => {
    const relativePath = '/.streamr/broker-config.json'
    return path.join(os.homedir(), relativePath)
}

export function overrideConfigToEnvVarsIfGiven(config: Config): void {

    const parseValue = (value: string) => {
        const number = /^-?\d+\.?\d*$/
        if (number.test(value)) {
            return Number(value)
        } else if (value === 'true') {
            return true
        } else if (value === 'false') {
            return false
        } else if (value == 'null') {
            return null
        } else {
            return value
        }
    }
    
    const PREFIX = 'STREAMR__BROKER__'
    Object.keys(process.env).forEach((variableName: string) => {
        if (variableName.startsWith(PREFIX)) {
            const parts = variableName.substring(PREFIX.length).split('__').map((part: string) => {
                const groups = part.match(/^([A-Z_]*[A-Z])(_\d+)?$/)
                if (groups !== null) {
                    const base = camelCase(groups[1])
                    const suffix = groups[2]
                    if (suffix === undefined) {
                        return base
                    } else {
                        const index = Number(suffix.substring(1)) - 1
                        return `${base}[${index}]`
                    }
                } else {
                    throw new Error(`Malformed environment variable ${variableName}`)
                }
            })
            const key = parts.join('.')
            const value = parseValue(process.env[variableName]!)
            set(config, key, value)
        }
    })
}
