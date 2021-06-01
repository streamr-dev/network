import express, { Request, Response } from 'express'
import { Server } from 'http'
import fetch from 'node-fetch'
import { startServer, stopServer } from '../../src/httpServer'
import { createApiAuthenticator } from '../../src/apiAuthenticator'

const MOCK_API_KEY = 'mock-api-key'
const PORT = 18888

const startTestServer = (apiConfig: { keys: string[] } | null) => {
    const router = express.Router()
    router.get('/foo', (_req: Request, res: Response) => {
        res.send('FOO')
    })
    return startServer([router], {
        port: PORT,
        privateKeyFileName: null,
        certFileName: null
    }, createApiAuthenticator({
        apiAuthentication: apiConfig
    } as any))
}

const createRequest = async (headers?: Record<string,string>) => {
    return await fetch(`http://127.0.0.1:${PORT}/api/v1/foo`, {
        headers
    })
}

describe('HttpServer', () => {

    let server: Server|undefined

    afterEach(async () => {
        if (server !== undefined) {
            await stopServer(server)
        }
    })

    describe('ApiAuthenticator', () => {
        
        it('no authentication required', async () => {
            server = await startTestServer(null)
            const response = await createRequest()
            const body = await response.text()
            expect(body).toBe('FOO')
        })

        it('valid authentication', async () => {
            server = await startTestServer({
                keys: [MOCK_API_KEY]
            })
            const response = await createRequest({
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            const body = await response.text()
            expect(body).toBe('FOO')
        })

        it('forbidden', async () => {
            server = await startTestServer({
                keys: [MOCK_API_KEY]
            })
            const response = await createRequest({
                Authorization: 'Bearer invalid-api-key'
            })
            expect(response.status).toBe(403)
        })

        it('unauthorized', async () => {
            server = await startTestServer({
                keys: [MOCK_API_KEY]
            })           
            const response = await createRequest()
            expect(response.status).toBe(401)
        })

    })

})
