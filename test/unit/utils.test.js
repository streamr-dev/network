import Emitter from 'events'

import sinon from 'sinon'
import Debug from 'debug'
import { wait } from 'streamr-test-utils'
import express from 'express'

import authFetch from '../../src/rest/authFetch'
import { uuid, pUpDownSteps, Defer, getEndpointUrl } from '../../src/utils'

const debug = Debug('StreamrClient::test::utils')

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
            const res = await authFetch(baseUrl + testUrl, session)
            expect(session.getSessionToken.calledOnce).toBeTruthy()
            expect(res.test).toBeTruthy()
        })

        it('should return 401 error when invalid session token is passed twice', async () => {
            session.getSessionToken = sinon.stub().resolves('invalid token')
            const onCaught = jest.fn()
            await authFetch(baseUrl + testUrl, session).catch((err) => {
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

            const res = await authFetch(baseUrl + testUrl, session)
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

    describe('pUpDownSteps', () => {
        let order
        let up
        let down
        let emitter
        let onDone
        let onChange
        // const log = debug.extend('pUpDownSteps')

        beforeEach(() => {
            if (emitter) {
                emitter.removeAllListeners()
            }

            order = []
            const currentOrder = order
            emitter = new Emitter()

            emitter.on('next', (name, v = '') => {
                const msg = `${name} ${v}`.trim()
                // log(msg)
                currentOrder.push(msg)
            })

            const currentEmitter = emitter
            up = async (...args) => {
                currentEmitter.emit('next', 'up start', ...args)
                await wait(50)
                currentEmitter.emit('next', 'up end', ...args)
            }

            down = async (...args) => {
                currentEmitter.emit('next', 'down start', ...args)
                await wait(10)
                currentEmitter.emit('next', 'down end', ...args)
            }

            onDone = (isUp) => {
                currentEmitter.emit('next', 'done', isUp ? 'up' : 'down')
            }

            onChange = (isUp) => {
                currentEmitter.emit('next', 'change', isUp ? 'up' : 'down')
            }
        })

        it('calls up/down once', async () => {
            let shouldUp = true
            const next = pUpDownSteps([
                async () => {
                    await up()
                    return () => down()
                }
            ], () => shouldUp, {
                onDone, onChange
            })

            await Promise.all([
                next(),
                next()
            ])

            await next()

            shouldUp = false

            await Promise.all([
                next(),
                next()
            ])

            await next()

            expect(order).toEqual([
                'change up',
                'up start',
                'up end',
                'done up',
                'change down',
                'down start',
                'down end',
                'done down'
            ])
        })

        it('calls down automatically if check is false after up complete', async () => {
            let shouldUp = true
            const next = pUpDownSteps([
                async () => {
                    await up()
                    shouldUp = false
                    return () => down()
                }
            ], () => shouldUp, {
                onDone, onChange
            })

            await next()
            expect(order).toEqual([
                'change up',
                'up start',
                'up end',
                'change down',
                'down start',
                'down end',
                'done down'
            ])
        })

        it('downs on error in up', async () => {
            const err = new Error('expected')
            const next = pUpDownSteps([
                async () => {
                    await up('a')
                    return () => down('a')
                },
                async () => {
                    await up('b')
                    throw err
                },
            ], () => true, {
                onDone, onChange
            })

            await expect(async () => {
                await next()
            }).rejects.toThrow(err)

            expect(order).toEqual([
                'change up',
                'up start a',
                'up end a',
                'up start b',
                'up end b',
                'change down',
                'down start a',
                'down end a',
                'done down'
            ])
        })

        it('downs on error in check', async () => {
            const err = new Error('expected')
            let shouldThrow = false
            const next = pUpDownSteps([
                async () => {
                    await up('a')
                    return () => down('a')
                },
                async () => {
                    await up('b')
                    shouldThrow = true
                    return () => down('b')
                },
            ], () => {
                if (shouldThrow) {
                    throw err
                }
                return true
            }, {
                onDone, onChange
            })

            await expect(async () => {
                await next()
            }).rejects.toThrow(err)

            expect(order).toEqual([
                'change up',
                'up start a',
                'up end a',
                'up start b',
                'up end b',
                'change down',
                'down start b', // down should run
                'down end b',
                'down start a',
                'down end a',
                'done down'
            ])
        })

        it('continues to down if on error in down', async () => {
            let shouldUp = true

            const err = new Error('expected')
            const currentEmitter = emitter
            currentEmitter.on('next', (event, name) => {
                if (event === 'down start' && name === 'c') {
                    throw err // throw on down b
                }
            })

            const next = pUpDownSteps([
                async () => {
                    await up('a')
                    return () => down('a')
                },
                async () => {
                    await up('b')
                    return async () => {
                        await down('b')
                    }
                },
                async () => {
                    await up('c')
                    return async () => {
                        await down('c') // this should throw due to on('next' above
                    }
                },
            ], () => shouldUp, {
                onDone, onChange
            })

            await next()
            shouldUp = false
            await expect(async () => {
                await next()
            }).rejects.toThrow(err)

            expect(order).toEqual([
                'change up',
                'up start a',
                'up end a',
                'up start b',
                'up end b',
                'up start c',
                'up end c',
                'done up',
                'change down',
                'down start c', // down should run (will error)
                'down start b',
                'down end b',
                'down start a', // down for other steps should continue
                'down end a',
                'done down',
            ])
        })

        it('continues to down if on error in last down', async () => {
            let shouldUp = true

            const err = new Error('expected')
            const currentEmitter = emitter
            currentEmitter.on('next', (event, name) => {
                if (event === 'down start' && name === 'a') {
                    throw err // throw on down b
                }
            })

            const next = pUpDownSteps([
                async () => {
                    await up('a')
                    return () => down('a') // this should throw due to on('next' above
                },
                async () => {
                    await up('b')
                    return async () => {
                        await down('b')
                    }
                },
            ], () => shouldUp, {
                onDone, onChange
            })

            await next()
            shouldUp = false
            await expect(async () => {
                await next()
            }).rejects.toThrow(err)

            expect(order).toEqual([
                'change up',
                'up start a',
                'up end a',
                'up start b',
                'up end b',
                'done up',
                'change down',
                'down start b', // down should run (will error)
                'down end b',
                'down start a', // down for other steps should continue
                'done down',
            ])
        })

        it('does nothing if check fails', async () => {
            const shouldUp = false
            const next = pUpDownSteps([
                async () => {
                    await up()
                    return () => down()
                }
            ], () => shouldUp, {
                onDone, onChange
            })

            await next()

            expect(order).toEqual([])
        })

        it('cancels up if check fails', async () => {
            let shouldUp = true
            const next = pUpDownSteps([
                async () => {
                    await up()
                    shouldUp = false
                    return () => down()
                }
            ], () => shouldUp, {
                onDone, onChange
            })

            await next()

            expect(order).toEqual([
                'change up',
                'up start',
                'up end',
                'change down',
                'down start',
                'down end',
                'done down',
            ])
        })

        it('cancels up if onChange errors', async () => {
            const err = new Error('expected')
            const next = pUpDownSteps([
                async () => {
                    await up()
                    return () => down()
                }
            ], () => true, {
                onDone,
                onChange: () => {
                    throw err
                }
            })

            await expect(async () => next()).rejects.toThrow(err)

            expect(order).toEqual([])
        })

        it('continues down if onChange errors', async () => {
            let shouldUp = true
            const err = new Error('expected')
            const next = pUpDownSteps([
                async () => {
                    await up()
                    return () => down()
                }
            ], () => shouldUp, {
                onDone,
                onChange: (goingUp) => {
                    onChange(goingUp)
                    if (!goingUp) {
                        throw err
                    }
                }
            })

            await next()

            shouldUp = false

            await expect(async () => next()).rejects.toThrow(err)

            expect(order).toEqual([
                'change up',
                'up start',
                'up end',
                'done up',
                'change down',
                'down start',
                'down end',
                'done down',
            ])
        })

        it('can change status in onChange', async () => {
            let shouldUp = true
            let once = false
            const next = pUpDownSteps([
                async () => {
                    await up()
                    return () => down()
                }
            ], () => shouldUp, {
                onDone,
                onChange: (goingUp) => {
                    onChange(goingUp)
                    if (!goingUp && !once) {
                        once = true
                        shouldUp = true
                    }
                }
            })

            await next()

            shouldUp = false

            await next()

            expect(order).toEqual([
                'change up',
                'up start',
                'up end',
                'done up',
                'change down',
                'change up',
            ])
        })

        it('calls one at a time when down called during up', async () => {
            let shouldUp = true

            const next = pUpDownSteps([
                async () => {
                    await up()
                    return () => down()
                }
            ], () => shouldUp, {
                onDone, onChange
            })
            const done = Defer()
            emitter.on('next', async (name) => {
                if (name === 'up start') {
                    shouldUp = false
                    done.resolve(next())
                }
            })

            await Promise.all([
                next(),
                done,
            ])

            expect(order).toEqual([
                'change up',
                'up start',
                'up end',
                'change down',
                'down start',
                'down end',
                'done down',
            ])
        })

        describe('plays undo stack at point of state change', () => {
            let shouldUp
            let next
            const allUp = [
                'change up',
                'up start a',
                'up end a',
                'up start b',
                'up end b',
                'up start c',
                'up end c',
                'done up',
            ]

            const allDown = [
                'change down',
                'down start c',
                'down end c',
                'down start b',
                'down end b',
                'down start a',
                'down end a',
                'done down',
            ]

            beforeEach(() => {
                shouldUp = false

                next = pUpDownSteps([
                    async () => {
                        await up('a')
                        return () => down('a')
                    },
                    async () => {
                        await up('b')
                        return () => down('b')
                    },
                    async () => {
                        await up('c')
                        return () => down('c')
                    },
                ], () => shouldUp, {
                    onDone, onChange
                })
            })

            it('plays all up steps in order, then down steps in order', async () => {
                shouldUp = true
                await next()
                expect(order).toEqual(allUp)
                shouldUp = false

                await next()
                expect(order).toEqual([
                    ...allUp,
                    ...allDown
                ])
            })

            it('can stop before first step', async () => {
                shouldUp = true
                const done = Defer()
                emitter.on('next', async (name, v) => {
                    if (name === 'up start' && v === 'a') {
                        shouldUp = false
                        done.resolve()
                    }
                })

                await Promise.all([
                    next(),
                    done,
                ])

                expect(order).toEqual([
                    'change up',
                    'up start a',
                    'up end a',
                    'change down',
                    'down start a',
                    'down end a',
                    'done down',
                ])
            })

            it('can stop before second step', async () => {
                shouldUp = true
                const done = Defer()
                emitter.on('next', async (name, v) => {
                    if (name === 'up end' && v === 'b') {
                        shouldUp = false
                        done.resolve()
                    }
                })

                await Promise.all([
                    next(),
                    done,
                ])

                expect(order).toEqual([
                    'change up',
                    'up start a',
                    'up end a',
                    'up start b',
                    'up end b',
                    'change down',
                    'down start b',
                    'down end b',
                    'down start a',
                    'down end a',
                    'done down',
                ])
            })

            it('can interrupt down while going down', async () => {
                const done = Defer()
                shouldUp = true
                emitter.on('next', async (name, v) => {
                    if (name === 'down end' && v === 'b') {
                        shouldUp = true
                        done.resolve()
                    }
                })
                await next()
                shouldUp = false
                await next()
                await done
                expect(order).toEqual([
                    ...allUp,
                    'change down',
                    'down start c',
                    'down end c',
                    'down start b',
                    'down end b',
                    'change up',
                    'up start b',
                    'up end b',
                    'up start c',
                    'up end c',
                    'done up',
                ])
            })

            it('can interrupt down while going down & during change', async () => {
                const done1 = Defer()
                const done2 = Defer()
                const done3 = Defer()
                shouldUp = true
                let count = 0
                emitter.on('next', async (name, v) => {
                    if (name === 'down end' && v === 'b') {
                        count += 1
                        shouldUp = true
                        done1.resolve()
                    }

                    if (name === 'change' && v === 'up' && count === 1) {
                        count += 1
                        shouldUp = false
                        done2.resolve()
                    }

                    if (name === 'change' && v === 'down' && count === 2) {
                        count += 1
                        shouldUp = true
                        done3.resolve()
                    }
                })
                await next()
                shouldUp = false
                await next()
                await done1
                await done2
                await done3
                expect(order).toEqual([
                    ...allUp,
                    'change down',
                    'down start c',
                    'down end c',
                    'down start b',
                    'down end b',
                    'change up',
                    'change down',
                    'change up',
                    'up start b',
                    'up end b',
                    'up start c',
                    'up end c',
                    'done up',
                ])
            })
        })
    })
})
