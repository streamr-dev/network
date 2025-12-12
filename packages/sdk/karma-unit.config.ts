import webpackConfig from './webpack-karma.config'
import { createKarmaConfig } from '@streamr/browser-test-runner'

export default createKarmaConfig(['test/unit/**/*.ts'], webpackConfig, __dirname)
