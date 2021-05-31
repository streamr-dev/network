import express, { Request, Response } from 'express'
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

    describe('ApiAuthenticator', () => {
        
        it('no authentication required', async () => {
            const server = await startTestServer(null)
            const response = await createRequest()
            const body = await response.text()
            expect(body).toBe('FOO')
            await stopServer(server)
        })

        it('valid authentication', async () => {
            const server = await startTestServer({
                keys: [MOCK_API_KEY]
            })
            try {
                const response = await createRequest({
                    Authorization: `Bearer ${MOCK_API_KEY}`
                })
                const body = await response.text()
                expect(body).toBe('FOO')    
            } finally {
                await stopServer(server)
            }
        })

        it('forbidden', async () => {
            const server = await startTestServer({
                keys: [MOCK_API_KEY]
            })
            try {
                const response = await createRequest({
                    Authorization: 'Bearer invalid-api-key'
                })
                expect(response.status).toBe(403)
            } finally {
                await stopServer(server)
            }
        })

        it('unauthorized', async () => {
            const server = await startTestServer({
                keys: [MOCK_API_KEY]
            })           
            try {
                const response = await createRequest()
                expect(response.status).toBe(401)
            } finally {
                await stopServer(server)
            }
        })

    })

})