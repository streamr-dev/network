import { StreamrClientConfig } from 'streamr-client'
import path from 'path'
import * as os from 'os'

export interface HttpServerConfig {
    port: number
    privateKeyFileName?: string
    certFileName?: string
}

export interface ApiAuthenticationConfig { 
    keys: string[]
}

export interface Config {
    $schema: string
    client: StreamrClientConfig
    httpServer: HttpServerConfig
    plugins: Record<string, any>
    apiAuthentication?: ApiAuthenticationConfig
}

export const getDefaultFile = (): string => {
    const relativePath = '.streamr/config/default.json'
    return path.join(os.homedir(), relativePath)
}

export const getLegacyDefaultFile = (): string => {
    const relativePath = '/.streamr/broker-config.json'
    return path.join(os.homedir(), relativePath)
}
