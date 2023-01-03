import fs from 'fs'
import path from 'path'
import { createBroker } from '../../src/broker'

const PATH = './configs'

describe('Config', () => {

    const fileNames = fs.readdirSync(PATH)

    describe.each(fileNames.map((fileName) => [fileName]))('validate', (fileName: string) => {

        it(fileName, () => {
            const filePath = PATH + path.sep + fileName
            const content = fs.readFileSync(filePath)
            const config = JSON.parse(content.toString())
            return expect(createBroker(config)).resolves.toBeDefined()
        })

    })

    it('environment variable OVERRIDE_BROKER_PRIVATE_KEY overrides config (NET-934)', async () => {
        const PK = '0xf3abf913aece5ca05f86959ac7246e8f877c41735e4e1593acc8dfb9ad5f8a9a'
        process.env.OVERRIDE_BROKER_PRIVATE_KEY = PK
        const content = fs.readFileSync(PATH + path.sep + fileNames[0])
        const config = JSON.parse(content.toString())
        await createBroker(config)
        expect(config.client.auth.privateKey).toEqual(PK)
    })

    it('environment variable OVERRIDE_BROKER_BENEFICIARY_ADDRESS overrides config (NET-934)', async () => {
        const BENEFICIARY_ADDRESS = '0x1957abc2e960eb5f2c6a166e7a628ded7570e298'
        process.env.OVERRIDE_BROKER_BENEFICIARY_ADDRESS = BENEFICIARY_ADDRESS
        const content = fs.readFileSync(PATH + path.sep + fileNames[0])
        const config = JSON.parse(content.toString())
        config.plugins.brubeckMiner = {}
        await createBroker(config)
        expect(config.plugins.brubeckMiner.beneficiaryAddress).toEqual(BENEFICIARY_ADDRESS)
    })
})
