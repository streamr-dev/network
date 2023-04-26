const buildConfig = require("@streamr/browser-test-runner")
const path = require("path")

module.exports = buildConfig(
    './src/exports-browser.ts',
    'network-node',
    [
        './test/browser/BrowserWebRtcConnection.test.ts',
        './test/browser/IntegrationBrowserWebRtcConnection.test.ts',
        './test/integration/**/!(NodeWebRtcConnection*|tracker*|nodeMessageBuffering*|UnixSocketWsServer*|message-duplication*).ts/',
        './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*|Speedometer*|deprecated-tracker-status*).ts'
    ],
    {
        [path.resolve(__dirname, 'src/connection/webrtc/NodeWebRtcConnection.ts')]:
            path.resolve(__dirname, 'src/connection/webrtc/BrowserWebRtcConnection.ts'),
        [path.resolve(__dirname, 'src/connection/ws/NodeClientWsEndpoint.ts')]:
            path.resolve(__dirname, 'src/connection/ws/BrowserClientWsEndpoint.ts'),
        [path.resolve(__dirname, 'src/connection/ws/NodeClientWsConnection.ts')]:
            path.resolve(__dirname, 'src/connection/ws/BrowserClientWsConnection.ts'),
    })
