import express from 'express'
import http from 'http'
import { Logger, wait } from '@streamr/utils'
import { fetchFileToMemory } from './fetchFileToMemory'

const logger = new Logger(module)

type ExpressType = ReturnType<typeof express>
type ServerType = ReturnType<ExpressType['listen']>

const dbUrl = 'https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/GeoLite2-City.tar.gz'
const hashUrl = 'https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/GeoLite2-City.mmdb.sha384'

const dbFileName = '/GeoLite2-City.tar.gz'
const hashFileName = '/GeoLite2-City.mmdb.sha384'

export class TestServer {
    private server?: ServerType
    private abortController?: AbortController

    private static hashData?: Uint8Array
    private static dbData?: Uint8Array

    private static async prefetchData(): Promise<void> {
        TestServer.hashData = await fetchFileToMemory(hashUrl)
        TestServer.dbData = await fetchFileToMemory(dbUrl)
    }

    private async writeDataKilobytesPerSecond(res: http.ServerResponse, data: Uint8Array, kilobytesPerSecond?: number): Promise<void> {

        let delayMilliseconds: number | undefined = undefined

        if (kilobytesPerSecond) {
            delayMilliseconds = 1000 / kilobytesPerSecond
        }
        const chuckSize = 1024
        for (let i = 0; i < data.length && !this.abortController?.signal.aborted; i += chuckSize) {
            let end = i + chuckSize
            if (end > data.length) {
                end = data.length
            }
            res.write(data.slice(i, end))

            if (delayMilliseconds) {
                await wait(delayMilliseconds, this.abortController?.signal)
            }
        }
    }

    async start(port: number, kiloBytesPerSecond?: number): Promise<void> {
        if (!TestServer.hashData || !TestServer.dbData) {
            await TestServer.prefetchData()
        }

        if (this.server) {
            throw new Error('Test server already running')
        }

        this.abortController = new AbortController()

        return new Promise((resolve, _reject) => {
            const app = express()

            app.get(dbFileName, (_req, res) => {
                res.setHeader('Content-Type', 'application/gzip')

                this.writeDataKilobytesPerSecond(res, TestServer.dbData!,
                    kiloBytesPerSecond).then(() => {
                    res.end()
                }).catch((_err) => {
                    res.end()
                })
            })

            app.get(hashFileName, (_req, res) => {
                res.setHeader('Content-Type', 'text/plain')

                this.writeDataKilobytesPerSecond(res, TestServer.hashData!,
                    kiloBytesPerSecond).then(() => {
                    res.end()
                }).catch((_err) => {
                    res.end()
                })
            })

            this.server = http.createServer(app)
            this.server.listen(port, () => {
                logger.info('Test server is running on port ' + port)
                resolve()
            })
        })
    }

    stop(): void {
        if (this.server) {
            this.abortController!.abort()
            this.server.close()
            this.server.closeAllConnections()
            this.server = undefined
        }
    }
}
