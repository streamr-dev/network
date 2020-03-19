import assert from 'assert'

import sinon from 'sinon'

import authFetch from '../../src/rest/authFetch'

const express = require('express')

describe('utils', () => {
    let session
    let expressApp
    let server
    const baseUrl = 'http://127.0.0.1:30000'
    const testUrl = '/some-test-url'

    beforeAll((done) => {
        session = sinon.stub()
        session.options = {}
        expressApp = express()

        function handle(req, res) {
            if (req.get('Authorization') !== 'Bearer session-token') {
                res.sendStatus(401)
            } else {
                res.status(200).send({
                    test: 'test',
                })
            }
        }

        expressApp.get(testUrl, (req, res) => handle(req, res))

        server = expressApp.listen(30000, () => {
            console.info('Mock server started on port 30000\n') // eslint-disable-line no-console
            done()
        })
    })

    afterAll((done) => {
        server.close(done)
    })

    describe('authFetch', () => {
        it('should return normally when valid session token is passed', async () => {
            session.getSessionToken = sinon.stub().resolves('session-token')
            const res = await authFetch(baseUrl + testUrl, session)
            assert(session.getSessionToken.calledOnce)
            assert(res.test)
        })
        it('should return 401 error when invalid session token is passed twice', (done) => {
            session.getSessionToken = sinon.stub().resolves('invalid token')
            return authFetch(baseUrl + testUrl, session).catch((err) => {
                assert(session.getSessionToken.calledTwice)
                assert.equal(err.toString(), `Error: Request to ${baseUrl + testUrl} returned with error code 401. Unauthorized`)
                assert.equal(err.body, 'Unauthorized')
                done()
            })
        })
        it('should return normally when valid session token is passed after expired session token', async () => {
            session.getSessionToken = sinon.stub()
            session.getSessionToken.onCall(0).resolves('expired-session-token')
            session.getSessionToken.onCall(1).resolves('session-token')

            const res = await authFetch(baseUrl + testUrl, session)
            assert(session.getSessionToken.calledTwice)
            assert(res.test)
        })
    })
})
