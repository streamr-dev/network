import { Server } from 'http'
import sinon from 'sinon'
import express, { Application } from 'express'
import { wait } from 'streamr-test-utils'

import authFetch from '../../src/rest/authFetch'
import * as utils from '../../src/utils'
import { inspect, format, DEFAULT_INSPECT_OPTS } from '../../src/utils/log'

import { describeRepeats, Debug } from '../utils'

const debug = Debug('StreamrClient::test::utils')

interface TestResponse {
    test: string
}

describeRepeats('utils', () => {
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

    afterAll(async () => {
        await wait(1000) // wait a moment for server to truly close
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
            expect(utils.uuid('test')).not.toEqual(utils.uuid('test'))
        })
        it('includes text', () => {
            expect(utils.uuid('test')).toContain('test')
        })
        it('increments', () => {
            const uid = utils.uuid('test') // generate new text to ensure count starts at 1
            expect(utils.uuid(uid) < utils.uuid(uid)).toBeTruthy()
        })
    })

    describe('getEndpointUrl', () => {
        it('works', () => {
            const streamId = 'x/y'
            const url = utils.getEndpointUrl('http://example.com', 'abc', streamId, 'def')
            expect(url.toLowerCase()).toBe('http://example.com/abc/x%2fy/def')
        })
    })

    describe('until', () => {
        it('works with sync true', async () => {
            const condition = jest.fn(() => true)
            await utils.until(condition)
            expect(condition).toHaveBeenCalledTimes(1)
        })

        it('works with async true', async () => {
            const condition = jest.fn(async () => true)
            await utils.until(condition)
            expect(condition).toHaveBeenCalledTimes(1)
        })

        it('works with sync false -> true', async () => {
            let calls = 0
            const condition = jest.fn(() => {
                calls += 1
                return calls > 1
            })
            await utils.until(condition)
            expect(condition).toHaveBeenCalledTimes(2)
        })

        it('works with sync false -> true', async () => {
            let calls = 0
            const condition = jest.fn(async () => {
                calls += 1
                return calls > 1
            })
            await utils.until(condition)
            expect(condition).toHaveBeenCalledTimes(2)
        })

        it('can time out', async () => {
            const condition = jest.fn(() => false)
            await expect(async () => {
                await utils.until(condition, 100)
            }).rejects.toThrow('Timeout')
            expect(condition).toHaveBeenCalled()
        })

        it('can set interval', async () => {
            const condition = jest.fn(() => false)
            await expect(async () => {
                await utils.until(condition, 100, 20)
            }).rejects.toThrow('Timeout')
            expect(condition).toHaveBeenCalledTimes(5) // exactly 5
        })
    })

    describe('util/log', () => {
        const longString = 'longString'.repeat(DEFAULT_INSPECT_OPTS.maxStringLength)
        it('inspect limits string length', () => {
            expect(inspect({ longString }).length).toBeLessThan(DEFAULT_INSPECT_OPTS.maxStringLength * 1.2)
        })
        it('format limits string length', () => {
            expect(format('%o', { longString }).length).toBeLessThan(DEFAULT_INSPECT_OPTS.maxStringLength * 1.2)
        })
    })
})
