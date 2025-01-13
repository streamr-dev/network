import { Database, Subdomain } from '../../src/Database'

describe('Database', () => {
    let db: Database

    beforeAll(async () => {
        db = new Database(':memory:')
        await db.start()
    })

    afterAll(async () => {
        await db.stop()
    })

    describe('createSubdomain()', () => {
        it('should create a new subdomain', async () => {
            const subdomain: Subdomain = {
                subdomainName: 'example.com',
                ip: '127.0.0.1',
                port: '8080',
                token: 'abc123'
            }

            await db.createSubdomain(subdomain.subdomainName, subdomain.ip, subdomain.port, subdomain.token)

            const result = await db.getSubdomain(subdomain.subdomainName)

            expect(result).toEqual(expect.objectContaining(subdomain))
        })
    })

    describe('updateSubdomainIp()', () => {
        // TODO: remove storing port in the data base
        it('should update the IP and port of an existing subdomain', async () => {
            const subdomain: Subdomain = {
                subdomainName: 'example.com',
                ip: '127.0.0.1',
                port: '8080',
                token: 'abc123'
            }

            await db.createSubdomain(subdomain.subdomainName, subdomain.ip, subdomain.port, subdomain.token)

            const newIp = '192.168.0.1'
            const newPort = '80'

            await db.updateSubdomainIp(subdomain.subdomainName, newIp, newPort, subdomain.token)

            const result = await db.getSubdomain(subdomain.subdomainName)

            expect(result?.ip).toEqual(newIp)
            expect(result?.port).toEqual(newPort)
        })

        it('should throw if a IP and PORT update is tried with wrong token', async () => {
            const subdomain: Subdomain = {
                subdomainName: 'ex.com',
                ip: '127.0.0.1',
                port: '8080',
                token: 'abc123'
            }

            await db.createSubdomain(subdomain.subdomainName, subdomain.ip, subdomain.port, subdomain.token)

            const newIp = '192.168.0.1'
            const newPort = '80'

            await expect(db.updateSubdomainIp(subdomain.subdomainName, newIp, newPort, 'wrongToken')).rejects.toThrow()
        })
    })

    describe('updateSubdomainAcmeChallenge()', () => {
        it('should update the ACME challenge of an existing subdomain', async () => {
            const subdomain: Subdomain = {
                subdomainName: 'example.com',
                ip: '127.0.0.1',
                port: '8080',
                token: 'abc123',
                acmeChallenge: '',
                createdAt: new Date()
            }

            await db.createSubdomain(subdomain.subdomainName, subdomain.ip, subdomain.port, subdomain.token)

            const newChallenge = '1234567890'

            await db.updateSubdomainAcmeChallenge(subdomain.subdomainName, newChallenge)

            const result = await db.getSubdomain(subdomain.subdomainName)

            expect(result?.acmeChallenge).toEqual(newChallenge)
        })
    })
})
