import webpackConfig from './webpack-karma.config'
import { createKarmaConfig } from '@streamr/browser-test-runner'

export default createKarmaConfig(['test/integration/**/*.ts'], webpackConfig, __dirname)
