/**
 * This setup script is executed indirectly by Karma via the `browser-test-runner`
 * package. See karma-config.js in that package for more details.
 */
import './src/setupTsyringe.ts'
import './test/test-utils/customMatchers'
import { customMatchers } from '@streamr/test-utils'

expect.extend(customMatchers)
