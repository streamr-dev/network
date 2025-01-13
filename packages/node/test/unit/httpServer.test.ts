import { Request, Response } from 'express'
import { Server } from 'http'
import { startServer, stopServer } from '../../src/httpServer'

const MOCK_API_KEY = 'mock-api-key'
const PORT = 18888

interface Endpoint {
    id: string
    keys?: string[]
}

const startTestServer = (...endpoints: Endpoint[]) => {
    return startServer(
        endpoints.map((endpoint) => ({
            path: `/${endpoint.id}`,
            method: 'get',
            requestHandlers: [
                (_req: Request, res: Response) => {
                    res.send(endpoint.id.toUpperCase())
                }
            ],
            apiAuthentication: endpoint.keys !== undefined ? { keys: endpoint.keys } : undefined
        })),
        {
            port: PORT
        }
    )
}

const createRequest = async (endpoint: string, headers?: Record<string, string>) => {
    return await fetch(`http://127.0.0.1:${PORT}/${endpoint}`, {
        signal: AbortSignal.timeout(9000),
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

    describe('API authentication', () => {
        it('no authentication required', async () => {
            server = await startTestServer({ id: 'foo' })
            const response = await createRequest('foo')
            const body = await response.text()
            expect(body).toBe('FOO')
        })

        it('valid authentication', async () => {
            server = await startTestServer({ id: 'foo', keys: [MOCK_API_KEY] })
            const response = await createRequest('foo', {
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            expect(await response.text()).toBe('FOO')
        })

        it('forbidden', async () => {
            server = await startTestServer({ id: 'foo', keys: [MOCK_API_KEY] })
            const response = await createRequest('foo', {
                Authorization: 'Bearer invalid-api-key'
            })
            expect(response.status).toBe(403)
        })

        it('unauthorized', async () => {
            server = await startTestServer({ id: 'foo', keys: [MOCK_API_KEY] })
            const response = await createRequest('foo')
            expect(response.status).toBe(401)
        })

        it('multiple endpoints', async () => {
            server = await startTestServer(
                { id: 'endpoint1', keys: ['other-key-1'] },
                { id: 'endpoint2', keys: [MOCK_API_KEY] },
                { id: 'endpoint3', keys: ['other-key-3'] }
            )
            const endpoint2response = await createRequest('endpoint2', {
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            expect(await endpoint2response.text()).toBe('ENDPOINT2')
            const endpoint3response = await createRequest('endpoint3', {
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            expect(endpoint3response.status).toBe(403)
        })
    })
})
