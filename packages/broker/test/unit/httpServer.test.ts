import { Request, Response } from 'express'
import { Server } from 'http'
import fetch from 'node-fetch'
import { startServer, stopServer } from '../../src/httpServer'

const MOCK_API_KEY = 'mock-api-key'
const PORT = 18888

interface Route {
    id: string
    keys?: string[]
}

const startTestServer = (...routes: Route[]) => {
    return startServer(routes.map((route) => ({
        path: `/${route.id}`,
        method: 'get',
        requestHandlers: [(_req: Request, res: Response) => {
            res.send(route.id.toUpperCase())
        }],
        apiAuthentication: (route.keys !== undefined) ? { keys: route.keys } : undefined
    })), {
        port: PORT
    })
}

const createRequest = async (route: string, headers?: Record<string, string>) => {
    return await fetch(`http://127.0.0.1:${PORT}/${route}`, {
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
            const response = await createRequest('foo', )
            expect(response.status).toBe(401)
        })

        it('multiple routes', async () => {
            server = await startTestServer(
                { id: 'route1', keys: ['other-key-1'] },
                { id: 'route2', keys: [MOCK_API_KEY] },
                { id: 'route3', keys: ['other-key-3'] }
            )
            const route2response = await createRequest('route2', {
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            expect(await route2response.text()).toBe('ROUTE2')
            const route3response = await createRequest('route3', {
                Authorization: `Bearer ${MOCK_API_KEY}`
            })
            expect(route3response.status).toBe(403)
        })

    })

})
