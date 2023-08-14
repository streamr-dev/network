"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Event = void 0;
var Event;
(function (Event) {
    Event["PEER_CONNECTED"] = "streamr:peer:connect";
    Event["PEER_DISCONNECTED"] = "streamr:peer:disconnect";
    Event["MESSAGE_RECEIVED"] = "streamr:message-received";
    Event["HIGH_BACK_PRESSURE"] = "streamr:high-back-pressure";
    Event["LOW_BACK_PRESSURE"] = "streamr:low-back-pressure";
})(Event || (exports.Event = Event = {}));
//# sourceMappingURL=IWebRtcEndpoint.js.map