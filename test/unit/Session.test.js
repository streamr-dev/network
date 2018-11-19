import assert from 'assert'
import sinon from 'sinon'
import Session from './../../src/Session'

describe('Session', () => {
    let session
    let msg

    beforeEach(() => {
        session = new Session()
        session.loginFunction = sinon.stub()
        session.loginFunction.onCall(0).resolves({
            token: 'session-token1',
        })
        session.loginFunction.onCall(1).resolves({
            token: 'session-token2',
        })
    })

    describe('getSessionToken', () => {
        it('should set sessionToken', async () => {
            await session.getSessionToken()
            assert(session.loginFunction.calledOnce)
            assert(session.options.sessionToken === 'session-token1')
        })
        it('should not call loginFunction if token set', async () => {
            session.options.sessionToken = 'session-token1'
            await session.getSessionToken()
            assert(session.loginFunction.notCalled)
        })
        it('should call loginFunction if new token required', async () => {
            session.options.sessionToken = 'expired-session-token'
            await session.getSessionToken(true)
            assert(session.loginFunction.calledOnce)
            assert(session.options.sessionToken === 'session-token1')
        })
    })

    describe('Internal state', () => {
        describe('loginFunction resolves', () => {
            it('should return same value when calling getSessionToken() twice while logging in', () => {
                const p1 = session.getSessionToken()
                const p2 = session.getSessionToken()
                return Promise.all([p1, p2]).then(([sessionToken1, sessionToken2]) => {
                    assert(session.loginFunction.calledOnce)
                    assert.equal(sessionToken1, sessionToken2)
                })
            })
            it('should return different values when retrieving fresh session tokens twice sequentially', async () => {
                const sessionToken1 = await session.getSessionToken(true)
                const sessionToken2 = await session.getSessionToken(true)
                assert.notStrictEqual(sessionToken1, sessionToken2)
            })
        })
        describe('loginFunction rejects', () => {
            beforeEach(() => {
                session = new Session()
                msg = 'Error: Need either "privateKey", "provider", "apiKey" or "username"+"password" to login.'
                session.loginFunction = sinon.stub().rejects(msg)
            })
            it('should fail both requests with one call to loginFunction', (done) => {
                const p1 = session.getSessionToken()
                const p2 = session.getSessionToken()
                p1.catch((err) => {
                    assert.equal(err.toString(), msg)
                })
                p2.catch((err) => {
                    assert.equal(err.toString(), msg)
                    assert(session.loginFunction.calledOnce)
                    done()
                })
            })
            it('should fail both requests with two calls to loginFunction', (done) => {
                const p1 = session.getSessionToken()
                p1.catch((err) => {
                    assert.equal(err.toString(), msg)
                    const p2 = session.getSessionToken()
                    p2.catch((err2) => {
                        assert.equal(err2.toString(), msg)
                        assert(session.loginFunction.calledTwice)
                        done()
                    })
                })
            })
        })
    })
})
