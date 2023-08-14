#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const package_json_1 = __importDefault(require("../package.json"));
const startTracker_1 = require("../src/startTracker");
const utils_1 = require("@streamr/utils");
const ethers_1 = require("ethers");
const logger = new utils_1.Logger(module);
const parseIntOption = (value) => parseInt(value, 10);
commander_1.program
    .version(package_json_1.default.version)
    .usage('<ethereumPrivateKey>')
    .option('--port <port>', 'port', parseIntOption, 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--unixSocket <unixSocket>', 'unixSocket', undefined)
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', parseIntOption, 4)
    .option('--attachHttpEndpoints', 'attach http endpoints')
    .option('--privateKeyFileName <privateKeyFileName>', 'private key filename', undefined)
    .option('--certFileName <certFileName>', 'cert filename', undefined)
    .option('--topologyStabilizationDebounceWait <topologyStabilizationDebounceWait>', 'topologyStabilizationDebounceWait')
    .option('--topologyStabilizationMaxWait <topologyStabilizationMaxWait>', 'topologyStabilizationMaxWait')
    .description('Run Streamr Tracker')
    .parse(process.argv);
if (commander_1.program.args.length < 1) {
    commander_1.program.help();
}
const privateKey = commander_1.program.args[0];
const wallet = new ethers_1.Wallet(privateKey);
const id = wallet.address;
const listen = commander_1.program.opts().unixSocket ? commander_1.program.opts().unixSocket : {
    hostname: commander_1.program.opts().ip,
    port: commander_1.program.opts().port
};
const logError = (err, errorType) => {
    logger.fatal('Encountered error', { err, errorType });
};
const getTopologyStabilization = () => {
    const debounceWait = commander_1.program.opts().topologyStabilizationDebounceWait;
    const maxWait = commander_1.program.opts().topologyStabilizationMaxWait;
    if ((debounceWait !== undefined) || (maxWait !== undefined)) {
        return {
            debounceWait: parseInt(debounceWait),
            maxWait: parseInt(maxWait)
        };
    }
    else {
        return undefined;
    }
};
async function main() {
    try {
        await (0, startTracker_1.startTracker)({
            listen,
            id,
            maxNeighborsPerNode: commander_1.program.opts().maxNeighborsPerNode,
            attachHttpEndpoints: commander_1.program.opts().attachHttpEndpoints,
            privateKeyFileName: commander_1.program.opts().privateKeyFileName,
            certFileName: commander_1.program.opts().certFileName,
            topologyStabilization: getTopologyStabilization(),
            metricsContext: new utils_1.MetricsContext(),
            trackerPingInterval: 60 * 1000
        });
        const trackerObj = {};
        const fields = [
            'ip', 'port', 'maxNeighborsPerNode', 'privateKeyFileName', 'certFileName', 'attachHttpEndpoints', 'unixSocket'
        ];
        fields.forEach((prop) => {
            trackerObj[prop] = commander_1.program.opts()[prop];
        });
        logger.info('Started', {
            id,
            ...trackerObj
        });
    }
    catch (err) {
        logError(err, 'tracker bin catch');
        process.exit(1);
    }
}
main();
// pino.finalLogger
process.on('uncaughtException', (err) => {
    logError(err, 'uncaughtException');
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    logError(err, 'unhandledRejection');
    process.exit(1);
});
//# sourceMappingURL=tracker.js.map