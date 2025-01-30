import { CustomMatchers } from './customMatchers'

// we could ES2015 module syntax (https://jestjs.io/docs/expect#expectextendmatchers),
// but the IDE doesn't find custom matchers if we do that
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface Expect extends CustomMatchers {}
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface Matchers<R> extends CustomMatchers<R> {}
    }
}
