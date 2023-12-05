import fs from 'fs'
import path from 'path'
import { createBroker } from '../../src/broker'
import { CONFIG_TEST } from 'streamr-client'

const PATH = './configs'

describe('Config', () => {

    it('start with minimal config', async () => {
        const broker = await createBroker({
            client: {
                ...CONFIG_TEST,
                network: {
                    ...CONFIG_TEST.network,
                    controlLayer: {
                        ...CONFIG_TEST.network!.controlLayer,
                        entryPoints: CONFIG_TEST.network!.controlLayer!.entryPoints,
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
                ...CONFIG_TEST,
                network: {
                    ...CONFIG_TEST.network,
                    controlLayer: {
                        ...CONFIG_TEST.network!.controlLayer,
                        entryPoints: [{
                            id: 'eeeeeeeeee',
                            websocket: {
                                'host': '10.200.10.1',
                                'port': 40500,
                                'tls': false
                            }
                        }],
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
