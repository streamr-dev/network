import { StreamrClientConfig } from 'streamr-client'
import path from 'path'
import * as os from 'os'

export interface SslCertificateConfig {
    privateKeyFileName: string
    certFileName: string
}

export interface HttpServerConfig {
    port: number
    sslCertificate?: SslCertificateConfig
}

export interface ApiAuthenticationConfig { 
    keys: string[]
}

export interface Config {
    client: StreamrClientConfig
    httpServer: HttpServerConfig
    plugins: Record<string, any>
    apiAuthentication?: ApiAuthenticationConfig
}

export interface ConfigFile extends Config {
    $schema: string
}

export const getDefaultFile = (): string => {
    const relativePath = '.streamr/config/default.json'
    return path.join(os.homedir(), relativePath)
}

export const getLegacyDefaultFile = (): string => {
    const relativePath = '/.streamr/broker-config.json'
    return path.join(os.homedir(), relativePath)
}
