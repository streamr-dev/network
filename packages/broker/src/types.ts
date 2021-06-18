export type Todo = any

export interface StreamPart {
    id: string
    partition: number
}

export interface SslCertificateConfig {
    privateKeyFileName: string
    certFileName: string
}