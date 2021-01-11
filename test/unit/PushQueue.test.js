import { wait } from 'streamr-test-utils'
import AbortController from 'node-abort-controller'

import PushQueue from '../../src/utils/PushQueue'
import { Defer } from '../../src/utils'

import IteratorTest from './IteratorTest'

const expected = [1, 2, 3, 4, 5, 6, 7, 8]
const WAIT = 20
const MAX_ITEMS = 3

async function* generate(items = expected) {
    await wait(WAIT * 0.1)
    for await (const item of items) {
        await wait(WAIT * 0.1)
        yield item
        await wait(WAIT * 0.1)
    }
    await wait(WAIT * 0.1)
}

describe('PushQueue', () => {
    IteratorTest('PushQueue works like regular iterator', ({ items }) => (
        new PushQueue([...items, null])
    ))

    IteratorTest('PushQueue.from works like regular iterator', ({ items }) => (
        PushQueue.from(generate([...items, null]))
    ))

    it('supports pre-buffering, async push & return', async () => {
        const q = new PushQueue()
        expect(q.length).toBe(0)
        q.push(expected[0])
        expect(q.length).toBe(1)
        q.push(expected[1])
        expect(q.length).toBe(2)

        setTimeout(() => {
            // buffer should have drained by now
            expect(q.length).toBe(0)
            q.push(expected[2])
            q.push(expected[3])
            setTimeout(() => {
                q.return(5) // both items above should get through
                q.push('nope') // this should not
            }, 20)
        }, 10)

        let i = 0
        for await (const msg of q) {
            expect(msg).toBe(expected[i])
            i += 1
        }

        expect(i).toBe(4)
        // buffer should have drained at end
        expect(q.length).toBe(0)
    })

    it('supports passing initial values to constructor', async () => {
        const q = new PushQueue(expected)
        expect(q.length).toBe(expected.length)

        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
            if (!q.length) {
                break // this calls await q.return()
            }
        }

        expect(msgs).toEqual(expected)

        // buffer should have drained at end
        expect(q.length).toBe(0)

        // these should have no effect
        q.push('c')
        expect(q.length).toBe(0)
        await q.return()
        expect(q.length).toBe(0)
    })

    describe('from', () => {
        it('supports sync iterable', async () => {
            const q = PushQueue.from(expected)
            expect(q.length).toBe(expected.length)

            const msgs = []
            // will end when source ends
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            await q.return()
        })

        it('supports async iterable', async () => {
            const q = PushQueue.from(generate())
            expect(q.length).toBe(0) // can't tell length upfront with async iterable

            const msgs = []
            // will end when source ends
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('errors if source errors', async () => {
            expect.assertions(5)
            const err = new Error('expected')
            const q = PushQueue.from(async function* GenerateError() {
                yield* generate()
                throw err
            }())
            expect(q.length).toBe(0) // can't tell length upfront with async iterable

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('expected')

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('errors if source errors immediately', async () => {
            expect.assertions(5)
            const err = new Error('expected')
            // eslint-disable-next-line require-yield
            const q = PushQueue.from(async function* GenerateError() {
                throw err
            }())

            expect(q.length).toBe(0)

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('expected')

            expect(msgs).toEqual([])

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('errors if sync source errors immediately', async () => {
            expect.assertions(5)
            const err = new Error('expected')
            // eslint-disable-next-line require-yield
            const q = PushQueue.from(function* GenerateError() {
                throw err
            }())

            expect(q.length).toBe(0)

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('expected')

            expect(msgs).toEqual([])

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('can require manually ending with instance.from end: false', async () => {
            expect.assertions(6)
            const q = new PushQueue()
            q.from(generate(), {
                end: false,
            })

            const msgs = []
            const callEnd = jest.fn(() => {
                let error
                try {
                    expect(q.isWritable()).toEqual(true)
                    expect(q.isReadable()).toEqual(true)
                } catch (err) {
                    error = err
                }
                q.end(error)
            })
            // will NOT end when source ends
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === expected.length) {
                    setTimeout(callEnd, 100)
                }
            }

            expect(callEnd).toHaveBeenCalledTimes(1)
            expect(msgs).toEqual(expected)
            expect(q.isWritable()).toEqual(false)
            expect(q.isReadable()).toEqual(false)
        })

        it('can require manually ending with autoEnd: false', async () => {
            expect.assertions(6)
            const q = PushQueue.from(generate(), {
                autoEnd: false,
            })

            const msgs = []
            const callEnd = jest.fn(() => {
                let error
                try {
                    expect(q.isWritable()).toEqual(true)
                    expect(q.isReadable()).toEqual(true)
                } catch (err) {
                    error = err
                }
                q.end(error)
            })
            // will NOT end when source ends
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === expected.length) {
                    setTimeout(callEnd, 100)
                }
            }

            expect(callEnd).toHaveBeenCalledTimes(1)
            expect(msgs).toEqual(expected)
            expect(q.isWritable()).toEqual(false)
            expect(q.isReadable()).toEqual(false)
        })

        it('can be aborted while waiting', async () => {
            expect.assertions(3)
            const startedWaiting = jest.fn()
            const ac = new AbortController()
            let q
            const itr = (async function* Gen() {
                yield* expected
                yield await new Promise(() => {
                    setTimeout(() => {
                        ac.abort()
                        q.push('nope1') // should no-op
                    })
                    startedWaiting()
                }) // would wait forever
            }())

            q = PushQueue.from(itr, {
                signal: ac.signal,
            })

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')

            expect(msgs).toEqual(expected)
            expect(startedWaiting).toHaveBeenCalledTimes(1)
        })
    })

    describe('end', () => {
        it('can clean end after emptying buffer by pushing null', async () => {
            const q = new PushQueue(expected) // wouldn't end on its own
            expect(q.length).toBe(expected.length)
            q.push(null) // won't end immediately
            expect(q.length).toBe(expected.length)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('does not buffer items after null', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected, null, 'c')
            expect(q.length).toBe(expected.length)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('can clean end after emptying buffer with end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === 1) {
                    q.end() // won't end immediately
                }
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('does not buffer more items after end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            expected.forEach((v) => q.push(v))
            expect(q.length).toBe(expected.length)
            q.end()
            expect(q.length).toBe(expected.length)
            q.push('c') // should have no effect
            expect(q.length).toBe(expected.length)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('can push final value then end after emptying buffer with end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === MAX_ITEMS) {
                    q.end('c') // won't end immediately
                }
            }

            expect(msgs).toEqual([...expected, 'c'])

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('can end with error', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)
            const err = new Error('expected error')
            q.end(err)

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow(err)

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('ignores end after end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)
            q.end()
            const err = new Error('expected error')
            q.end(err)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            expect(q.length).toBe(0)
        })

        it('works with pending next', async () => {
            const q = new PushQueue()
            q.push(expected[0]) // preload first item
            const msgsTask = Promise.all([
                q.next(),
                q.next(),
            ]).then((m) => m.map(({ value }) => value))
            q.push(...expected.slice(1)) // push rest after calls to next
            q.end() // finish up

            const msgs = await msgsTask
            for await (const msg of q) {
                msgs.push(msg) // gets rest of messages
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('works with end in loop', async () => {
            const q = new PushQueue(expected)
            const msgs = []
            for await (const msg of q) {
                msgs.push(msg) // gets rest of messages
                if (msgs.length === 2) {
                    q.end()
                }
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })
    })

    describe('onEnd', () => {
        it('fires when returned', async () => {
            const onEnd = jest.fn()
            const q = new PushQueue(expected, {
                onEnd,
            })

            expect(q.length).toBe(expected.length)
            await q.return()
            await wait(100)
            expect(onEnd).toHaveBeenCalledTimes(1)
            expect(q.length).toBe(0)
            for await (const msg of q) {
                throw new Error('should not get here ' + msg)
            }
            expect(onEnd).toHaveBeenCalledTimes(1)
        })

        it('fires when ended', async () => {
            const onEnd = jest.fn()
            const q = new PushQueue(expected, {
                onEnd,
            })
            q.end()

            expect(q.length).toBe(expected.length)
            expect(onEnd).toHaveBeenCalledTimes(0)
            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }
            expect(msgs).toEqual(expected)
            expect(onEnd).toHaveBeenCalledTimes(1)
        })

        it('fires when thrown', async () => {
            const onEnd = jest.fn()
            const q = PushQueue.from(expected, {
                onEnd,
            })

            const err = new Error('expected')
            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg) // gets rest of messages
                    if (msgs.length === 1) {
                        throw err
                    }
                }
            }).rejects.toThrow(err)

            expect(msgs).toEqual(expected.slice(0, 1))
            expect(onEnd).toHaveBeenCalledTimes(1)
        })

        it('fires when cancelled', async () => {
            const onEnd = jest.fn()
            const q = PushQueue.from(generate(), {
                onEnd,
            })

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === 1) {
                    await q.cancel()
                }
            }
            expect(msgs).toEqual(expected.slice(0, 1))
            expect(onEnd).toHaveBeenCalledTimes(1)
        })

        it('fires only after all items consumed and source is closed', async () => {
            const onEnd = jest.fn()
            const q = PushQueue.from(expected, {
                onEnd,
            })

            expect(q.length).toBe(expected.length)
            expect(onEnd).toHaveBeenCalledTimes(0)
            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                await wait(0)
                expect(onEnd).toHaveBeenCalledTimes(0)
            }
            expect(msgs).toEqual(expected)
            expect(onEnd).toHaveBeenCalledTimes(1)
        })
    })

    it('reduces length as items are consumed', async () => {
        const q = new PushQueue(expected)
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
            expect(q.length).toBe(expected.length - msgs.length)
            if (q.length === 0) {
                break
            }
        }
        expect(msgs).toEqual(expected)
    })

    it('does not consume buffered items after return', async () => {
        const q = new PushQueue(expected)
        expect(q.length).toBe(expected.length)
        await q.return()
        expect(q.length).toBe(0)
        for await (const msg of q) {
            throw new Error('should not get here ' + msg)
        }
    })

    it('handles break', async () => {
        const q = new PushQueue(expected)
        expect(q.length).toBe(expected.length)
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg) // gets rest of messages
            if (msgs.length === MAX_ITEMS) {
                break
            }
        }
        expect(msgs).toEqual(expected.slice(0, MAX_ITEMS))
    })

    it('cannot iterate after iteration done', async () => {
        const q = new PushQueue(expected)
        q.end()
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
        }
        // can't iterate again after return
        for await (const msg of q) {
            throw new Error('should not get here ' + msg)
        }
        expect(msgs).toEqual(expected)
    })

    it('supports passing multiple values to push', async () => {
        const q = new PushQueue()
        q.push(...expected)
        q.end()
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
        }

        expect(msgs).toEqual(expected)

        // buffer should have drained at end
        expect(q.length).toBe(0)
    })

    it('supports multiple simultaneous calls to next', async () => {
        const q = new PushQueue(expected)
        const msgs = await Promise.all([
            q.next(),
            q.next(),
        ]).then((m) => m.map(({ value }) => value))
        await q.return()

        expect(msgs).toEqual(expected.slice(0, 2))

        // buffer should have drained at end
        expect(q.length).toBe(0)
    })

    it('handles throw during iteration', async () => {
        const q = new PushQueue(expected)
        const err = new Error('expected error')
        const msgs = []

        await expect(async () => {
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === MAX_ITEMS) {
                    q.throw(err) // no await, no q.end
                }
            }
        }).rejects.toThrow(err)

        expect(msgs).toEqual(expected.slice(0, MAX_ITEMS))
        expect(q.length).toBe(0)
    })

    it('handles throw after end', async () => {
        const q = new PushQueue(expected)
        q.end()
        const err = new Error('expected error')
        const msgs = []

        await expect(async () => {
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === MAX_ITEMS) {
                    q.throw(err)
                }
            }
        }).rejects.toThrow(err)

        expect(msgs).toEqual(expected.slice(0, MAX_ITEMS))
        expect(q.length).toBe(0)
    })

    it('ignores pushed error after end', async () => {
        const q = new PushQueue(expected)
        q.end()
        const err = new Error('expected error')
        const msgs = []

        for await (const msg of q) {
            msgs.push(msg)
            if (msgs.length === MAX_ITEMS) {
                q.push(err)
            }
        }

        expect(msgs).toEqual(expected)
        expect(q.length).toBe(0)
    })

    it('handles async throw', async () => {
        const q = new PushQueue(expected)
        const err = new Error('expected error')
        const msgs = []
        setTimeout(() => {
            q.throw(err)
            q.push('c') // should no-op
        })

        await expect(async () => {
            for await (const msg of q) {
                msgs.push(msg)
            }
        }).rejects.toThrow(err)

        await wait(10) // wait for maybe push
        // push('c') shouldn't have worked
        expect(msgs).toEqual(expected)
        expect(q.length).toBe(0)
    })

    it('handles throw early', async () => {
        const q = new PushQueue()
        q.push('a') // should no-op
        const err = new Error('expected error')
        q.throw(err)
        q.push('c') // should no-op

        const msgs = []
        await expect(async () => {
            for await (const msg of q) {
                msgs.push(msg)
            }
        }).rejects.toThrow(err)

        await wait(10) // wait for maybe push
        // push('c') shouldn't have worked
        expect(q.length).toBe(0)

        expect(msgs).toEqual([])
    })

    describe('abort', () => {
        it('can be aborted', async () => {
            const ac = new AbortController()

            const q = new PushQueue(expected, {
                signal: ac.signal,
            })

            setTimeout(() => {
                ac.abort()
                q.push('nope1') // should no-op
            })

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')

            expect(msgs).toEqual(expected)
        })

        it('handles aborting multiple buffers', async () => {
            const ac = new AbortController()

            async function create(items = expected) {
                const q = new PushQueue(items, {
                    signal: ac.signal,
                })
                const msgs = []
                await expect(async () => {
                    for await (const msg of q) {
                        msgs.push(msg)
                    }
                }).rejects.toThrow('abort')
                await wait(10) // wait for maybe push
                expect(q.length).toBe(0)
                expect(msgs).toEqual(items)
            }

            setTimeout(() => {
                ac.abort()
            })

            await Promise.all([
                create(expected.slice(0, MAX_ITEMS)),
                create(expected.slice(MAX_ITEMS)),
                create([]),
            ])
        })

        it('can abort before iteration', async () => {
            const ac = new AbortController()

            const q = new PushQueue(expected, {
                signal: ac.signal,
            })

            q.push('nope1') // should no-op
            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                    if (msgs.length === MAX_ITEMS) {
                        ac.abort()
                    }
                }
            }).rejects.toThrow('abort')
            expect(msgs).toEqual(expected.slice(0, MAX_ITEMS)) // only gives buffered items before abort
        })

        it('can abort before creating PushQueue', async () => {
            const ac = new AbortController()
            ac.abort()

            const q = new PushQueue(expected, {
                signal: ac.signal,
            })
            q.push('nope1') // should no-op

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')
            expect(msgs).toEqual([]) // still gives buffered items
        })
    })
})
