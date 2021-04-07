import sinon from 'sinon'
import Debug from 'debug'
import express, { Application } from 'express'

import authFetch from '../../src/rest/authFetch'
import { uuid, getEndpointUrl } from '../../src/utils'
import { Server } from 'http'

const debug = Debug('StreamrClient::test::utils')

interface TestResponse {
    test: string
}

describe('utils', () => {
    let session: any
    let expressApp: Application
    let server: Server
    const baseUrl = 'http://127.0.0.1:30000'
    const testUrl = '/some-test-url'

    beforeAll((done) => {
        session = sinon.stub()
        session.options = {}
        expressApp = express()

        function handle(req: any, res: any) {
            if (req.get('Authorization') !== 'Bearer session-token') {
                res.sendStatus(401)
            } else {
                res.status(200).send({
                    test: 'test',
                })
            }
        }

        expressApp.get(testUrl, (req: any, res: any) => handle(req, res))

        server = expressApp.listen(30000, () => {
            debug('Mock server started on port 30000\n')
            done()
        })
    })

    afterAll((done) => {
        server.close(done)
    })

    describe('authFetch', () => {
        it('should return normally when valid session token is passed', async () => {
            session.getSessionToken = sinon.stub().resolves('session-token')
            const res = await authFetch<TestResponse>(baseUrl + testUrl, session)
            expect(session.getSessionToken.calledOnce).toBeTruthy()
            expect(res.test).toBeTruthy()
        })

        it('should return 401 error when invalid session token is passed twice', async () => {
            session.getSessionToken = sinon.stub().resolves('invalid token')
            const onCaught = jest.fn()
            await authFetch<TestResponse>(baseUrl + testUrl, session).catch((err) => {
                onCaught()
                expect(session.getSessionToken.calledTwice).toBeTruthy()
                expect(err.toString()).toMatch(
                    `${baseUrl + testUrl} returned with error code 401. Unauthorized`
                )
                expect(err.body).toEqual('Unauthorized')
            })
            expect(onCaught).toHaveBeenCalledTimes(1)
        })

        it('should return normally when valid session token is passed after expired session token', async () => {
            session.getSessionToken = sinon.stub()
            session.getSessionToken.onCall(0).resolves('expired-session-token')
            session.getSessionToken.onCall(1).resolves('session-token')

            const res = await authFetch<TestResponse>(baseUrl + testUrl, session)
            expect(session.getSessionToken.calledTwice).toBeTruthy()
            expect(res.test).toBeTruthy()
        })
    })

    describe('uuid', () => {
        it('generates different ids', () => {
            expect(uuid('test')).not.toEqual(uuid('test'))
        })
        it('includes text', () => {
            expect(uuid('test')).toContain('test')
        })
        it('increments', () => {
            const uid = uuid('test') // generate new text to ensure count starts at 1
            expect(uuid(uid) < uuid(uid)).toBeTruthy()
        })
    })

    describe('getEndpointUrl', () => {
        const streamId = 'x/y'
        const url = getEndpointUrl('http://example.com', 'abc', streamId, 'def')
        expect(url.toLowerCase()).toBe('http://example.com/abc/x%2fy/def')
    })
})
