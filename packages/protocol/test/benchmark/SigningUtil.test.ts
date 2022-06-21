import { verifyMessage, Wallet } from '@ethersproject/wallet'
import SigningUtil from '../../src/utils/SigningUtil'

/*
 * Benchmarking SigningUtil against ether.js implementation. This test is skipped
 * because we don't need to run this in CI. It is reasonable to run this
 * test e.g. when ethers.js releases a new major version. (If that version
 * provides equal performance compared to our implementation we could start to
 * use it.)
 * 
 * Compared to ethers v5.5.0 typical test results are:
 * 
 * Payload size 100 bytes:
 * - sign: ~400x faster
 * - verify: ~1600x faster
 * 
 * Payload size 10000 bytes:
 * - sign: ~50x faster
 * - verify: ~150x faster
 */

// From: https://stackoverflow.com/questions/10726909/random-alpha-numeric-string-in-javascript
function randomString(
    length: number,
    chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
): string {
    let result = ''
    for (let i = length; i > 0; --i) {
        result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
}

const ITERATIONS = 1000
const PAYLOAD_SIZES = [100, 10000]

describe.skip('SigningUtil', () => {
    
    describe.each(PAYLOAD_SIZES)('payload size: %s', (payloadSize: number) => {

        let wallet: Wallet
        let signature: string
        let payload: string

        beforeEach(async () => {
            wallet = Wallet.createRandom()
            payload = randomString(payloadSize)
            signature = await wallet.signMessage(payload)
        })

        const run = async <T>(
            functionToTest: () => Promise<T>,
            expectedResult: T,
            name: string
        ): Promise<number> => {
            const start = Date.now()
        
            let resultString = `${name} payloadSize=${payloadSize}\n`
        
            for (let i = 0; i < ITERATIONS; i++) {
                const result = await functionToTest()
                if (result !== expectedResult) {
                    throw new Error(`invalid result in ${name}`)
                }
            }
        
            const elapsed = Date.now() - start
        
            resultString += `Execution time: ${elapsed} ms\n`
            resultString += `Iterations: ${ITERATIONS}\n`
            resultString += `Iterations / second: ${ITERATIONS / (elapsed / 1000)}\n`
            const used: any = process.memoryUsage()
            Object.keys(used).forEach((key) => {
                resultString += `${key} ${Math.round((used[key] as number) / 1024 / 1024 * 100) / 100} MB\n`
            })
            console.info(resultString)
            return elapsed
        }
        
        it('sign', async () => {
    
            const elapsedTimeOur = await run(async () => {
                return SigningUtil.sign(payload, wallet.privateKey)
            }, signature, 'Sign-our')
    
            const elapsedTimeEthers = await run(async () => {
                return await wallet.signMessage(payload)
            }, signature, 'Sign-ethers.js')
    
            expect(elapsedTimeOur).toBeLessThan(elapsedTimeEthers)
    
            console.info(`Sign payloadSize=${payloadSize} is ${elapsedTimeEthers/elapsedTimeOur}x faster`)
    
        })
    
        it('verify', async () => {
    
            const elapsedTimeOur = await run(async () => {
                return SigningUtil.verify(wallet.address, payload, signature)
            }, true, 'Verify-our')
    
            const elapsedTimeEthers = await run(async () => {
                return verifyMessage(payload, signature).toLowerCase() === wallet.address.toLowerCase()
            }, true, 'Verify-ethers.js')
    
            expect(elapsedTimeOur).toBeLessThan(elapsedTimeEthers)
            
            console.info(`Verify payloadSize=${payloadSize} is ${elapsedTimeEthers/elapsedTimeOur}x faster`)
            
        })
    
    })

})