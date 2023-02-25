import { Request, Response } from 'express'
import { Server } from 'http'
import fetch from 'node-fetch'
import { createApiAuthenticator } from '../../src/apiAuthenticator'
import { startServer, stopServer } from '../../src/httpServer'

const MOCK_API_KEY = 'mock-api-key'
const PORT = 18888

const startTestServer = (keys?: string[]) => {
    const apiAuthenticator = createApiAuthenticator((keys !== undefined) ? {
        apiAuthentication: { keys }
    } : {})
    return startServer([{
        path: `/foo`,
        method: 'get',
        requestHandlers: [(_req: Request, res: Response) => {
            res.send('FOO')
        }]
    }], {
        port: PORT
    }, apiAuthenticator)
}

const createRequest = async (headers?: Record<string, string>) => {
    return await fetch(`http://127.0.0.1:${PORT}/foo`, {
        timeout: 9 * 1000,
        headers
    })
}

describe('HttpServer', () => {

    let server: Server | undefined

    afterEach(async () => {
        if (server !== undefined) {
            await stopServer(server)
        }
    })

    describe('ApiAuthenticator', () => {
        
        it('no authentication required', async () => {
            server = await startTestServer(undefined)
            const response = await createRequest()
            const body = await response.text()
            expect(body).toBe('FOO')
        })

        it('valid authentication', async () => {
            server = await startTestServer([MOCK_API_KEY])
            const response = await createRequest({
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            expect(await response.text()).toBe('FOO')
        })

        it('forbidden', async () => {
            server = await startTestServer([MOCK_API_KEY])
            const response = await createRequest({
                Authorization: 'Bearer invalid-api-key'
            })
            expect(response.status).toBe(403)
        })

        it('unauthorized', async () => {
            server = await startTestServer([MOCK_API_KEY])
            const response = await createRequest()
            expect(response.status).toBe(401)
        })

    })

})
