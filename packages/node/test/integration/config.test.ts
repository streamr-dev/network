import fs from 'fs'
import path from 'path'
import { createBroker } from '../../src/broker'

const PATH = './configs'

describe('Config', () => {
    it('start with minimal config', async () => {
        const broker = await createBroker({
            client: {
                environment: 'dev2',
                network: {
                    controlLayer: {
                        websocketServerEnableTls: false
                    }
                }
            }
        })
        await broker.start()
        await broker.stop()
    })

    it('temporary compatibility', async () => {
        const broker = await createBroker({
            client: {
                environment: 'dev2',
                network: {
                    controlLayer: {
                        entryPoints: [
                            {
                                id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                                websocket: {
                                    host: '10.200.10.1',
                                    port: 40500,
                                    tls: false
                                }
                            }
                        ],
                        websocketServerEnableTls: false
                    }
                }
            }
        } as any)
        await broker.start()
        await broker.stop()
    })

    const fileNames = fs.readdirSync(PATH)

    describe.each(fileNames.map((fileName) => [fileName]))('validate', (fileName: string) => {
        it(fileName, () => {
            const filePath = PATH + path.sep + fileName
            const content = fs.readFileSync(filePath)
            const config = JSON.parse(content.toString())
            return expect(createBroker(config)).resolves.toBeDefined()
        })
    })
})
