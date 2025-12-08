import webpackConfig from './webpack-karma.config'
import { createKarmaConfig } from '@streamr/browser-test-runner'

export default createKarmaConfig(['test/end-to-end/**/*.ts'], webpackConfig, __dirname)
