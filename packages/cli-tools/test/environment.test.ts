import { randomString } from '@streamr/utils'
import fs from 'fs/promises'
import { runCommand } from './utils'
import { StreamrClientConfig } from '@streamr/sdk'

const POLYGON_AMOY_CHAIN_ID = 80002

describe('env command line option', () => {
    it('takes precedence over client.environment config', async () => {
        const configFileName = `test-${randomString(10)}.json`
        await fs.writeFile(
            configFileName,
            JSON.stringify({
                client: {
                    environment: 'dev2'
                }
            })
        )
        const outputLines = await runCommand(`internal show-sdk-config --env polygonAmoy --config ${configFileName}`, {
            devEnvironment: false
        })
        const outputJson: StreamrClientConfig = JSON.parse(outputLines.join(''))
        await fs.unlink(configFileName)
        expect(outputJson.contracts!.ethereumNetwork!.chainId).toBe(POLYGON_AMOY_CHAIN_ID)
    })

    it(
        'invalid value',
        async () => {
            const outputLines = await runCommand('stream show foobar --env invalid-environment', {
                devEnvironment: false
            })
            expect(outputLines).toHaveLength(1)
            expect(outputLines[0]).toEqual('env must be one of: "polygon", "polygonAmoy", "dev2"')
        },
        60 * 1000
    )
})
