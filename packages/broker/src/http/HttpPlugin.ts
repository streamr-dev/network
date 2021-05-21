import fs from 'fs'
import { Server as HttpServer } from 'http'
import https, { Server as HttpsServer } from 'https'
import { AddressInfo } from 'net'
import cors from 'cors'
import express from 'express'
import { Logger } from 'streamr-network'
import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataProduceEndpoints } from './DataProduceEndpoints'
import { router as volumeEndpoint } from './VolumeEndpoint'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { AdapterConfig } from '../Adapter'
import { Plugin, PluginOptions } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

const logger = new Logger(module)

export interface HttpAdapterConfig extends AdapterConfig {
    privateKeyFileName: string|null, 
    certFileName: string|null
}

export class HttpPlugin extends Plugin<HttpAdapterConfig> {

    httpServer: HttpServer|HttpsServer|undefined

    constructor(options: PluginOptions<HttpAdapterConfig>) {
        super(options)
    }

    async start() {
        const streamFetcher = new StreamFetcher(this.config.streamrUrl)
        const app = express()
        app.use(cors())
        app.use('/api/v1', dataProduceEndpoints(streamFetcher, this.publisher))
        app.use('/api/v1', volumeEndpoint(this.metricsContext))    
        if (this.config.network.isStorageNode) {
            app.use('/api/v1', dataQueryEndpoints(this.cassandraStorage!, streamFetcher, this.metricsContext))
            app.use('/api/v1', dataMetadataEndpoint(this.cassandraStorage!))
            app.use('/api/v1', storageConfigEndpoints(this.storageConfig!))    
        }
        if (this.adapterConfig.privateKeyFileName && this.adapterConfig.certFileName) {
            this.httpServer = https.createServer({
                cert: fs.readFileSync(this.adapterConfig.certFileName),
                key: fs.readFileSync(this.adapterConfig.privateKeyFileName)
            }, app).listen(this.adapterConfig.port, () => logger.info(`HTTPS adapter listening on ${(this.httpServer!.address() as AddressInfo).port}`))
        } else {
            this.httpServer = app.listen(this.adapterConfig.port, () => logger.info(`HTTP adapter listening on ${(this.httpServer!.address() as AddressInfo).port}`))
        }
    }

    async stop() {
        return new Promise((resolve, reject) => {
            this.httpServer!.close((err?: Error) => {
                if (err) {
                    reject(err)
                } else {
                    // @ts-expect-error
                    resolve()
                }
            })
        })
    }
}