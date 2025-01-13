import { merge } from '../src/merge'

describe('merge', () => {
    it('two objects', () => {
        const o1 = {
            foo: 123,
            bar: 456,
            lorem: undefined
        }
        const o2 = {
            foo: 789,
            bar: undefined,
            ipsum: undefined
        }
        expect(merge(o1, o2)).toEqual({
            foo: 789,
            bar: 456
        })
    })

    it('multiple objects', () => {
        const o1 = {
            foo: 1
        }
        const o2 = {
            foo: 2
        }
        const o3 = {
            foo: 3
        }
        expect(merge(o1, o2, o3)).toEqual({
            foo: 3
        })
    })

    it('no objects', () => {
        expect(merge()).toEqual({})
    })

    it('do not mutate', () => {
        const o1 = {
            foo: 123,
            bar: 456,
            lorem: undefined
        }
        const o2 = {
            foo: 789,
            bar: undefined,
            ipsum: undefined
        }
        merge(o1, o2)
        expect(o1).toEqual({
            foo: 123,
            bar: 456,
            lorem: undefined
        })
        expect(o2).toEqual({
            foo: 789,
            bar: undefined,
            ipsum: undefined
        })
    })

    it('deeply', () => {
        interface Bar {
            lorem: number | undefined
            ipsum: number | undefined
            dolor: Record<string, number>
        }
        const o1 = {
            foo: 1,
            bar: {
                lorem: undefined,
                ipsum: 1,
                dolor: {
                    x: 1,
                    y: 2
                }
            } as Bar
        }
        const o2 = {
            foo: 2,
            bar: {
                lorem: 2,
                ipsum: undefined,
                dolor: {
                    y: 3,
                    z: 4
                }
            } as Bar
        }
        expect(merge(o1, o2)).toEqual({
            foo: 2,
            bar: {
                lorem: 2,
                ipsum: 1,
                dolor: {
                    x: 1,
                    y: 3,
                    z: 4
                }
            }
        })
    })

    it('undefineds are skipped', () => {
        const o1 = {
            foo: 1
        }
        const o2 = {
            foo: 2
        }
        expect(merge(undefined, o1, undefined, o2, undefined)).toEqual({
            foo: 2
        })
    })

    it('class instances are handled as object references', () => {
        class Foo {
            values: Record<string, unknown> = {}
        }
        const foo1 = new Foo()
        foo1.values = {
            x: 5,
            y: 6
        }
        const foo2 = new Foo()
        foo2.values = {
            y: 7,
            z: 8
        }
        const o1 = {
            foo: foo1
        }
        const o2 = {
            foo: foo2
        }
        const result = merge(o1, o2)
        expect(result.foo).toBe(foo2)
        expect(result.foo.values).toEqual({
            y: 7,
            z: 8
        })
    })

    it('arrays are overwritten', () => {
        const o1 = {
            foo: [1, 2, 3, { x: 1 }]
        }
        const o2 = {
            foo: [4, 5, 6, { y: 2 }]
        }
        expect(merge<any>(o1, o2)).toEqual({
            foo: [4, 5, 6, { y: 2 }]
        })
    })
})
