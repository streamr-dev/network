import { StreamrClientConfig } from 'streamr-client'
import path from 'path'
import * as os from 'os'

export interface Config {
    client: StreamrClientConfig
    httpServer: {
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

export const getDefaultFile = (): string => {
    const relativePath = '.streamr/config/default.json'
    return path.join(os.homedir(), relativePath)
}

export const getLegacyDefaultFile = (): string => {
    const relativePath = '/.streamr/broker-config.json'
    return path.join(os.homedir(), relativePath)
}
