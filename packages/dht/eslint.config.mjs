import baseConfig from '../../eslint.config.mjs'

export default [
    {
        // TODO remove when https://github.com/streamr-dev/network/pull/2848 merged to main
        ignores: [
            'src/connection/webrtc/BrowserWebrtcConnection.ts',
            'src/connection/websocket/BrowserWebsocketClientConnection.ts'
        ]
    },
    ...baseConfig
]
