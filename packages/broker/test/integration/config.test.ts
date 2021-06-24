import fs from 'fs'
import path from 'path'
import { validateBrokerConfig } from '../../src/helpers/validateConfig'

const PATH = './configs'

describe('Config', () => {

    const fileNames = fs.readdirSync(PATH)

    describe.each(fileNames.map((fileName) => [fileName]))('validate', (fileName: string) => {

        it(fileName, () => {
            const filePath = PATH + path.sep + fileName
            const content = fs.readFileSync(filePath)
            const config = JSON.parse(content.toString())
            expect(() => validateBrokerConfig(config)).not.toThrow()    
        })

    })
})