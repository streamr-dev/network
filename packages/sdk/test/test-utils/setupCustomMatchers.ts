import { customMatchers as localCustomMatchers } from './customMatchers'
import { customMatchers } from '@streamr/test-utils'

expect.extend(localCustomMatchers)
expect.extend(customMatchers)
