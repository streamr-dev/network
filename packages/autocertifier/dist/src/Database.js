"use strict";
/* eslint-disable  @typescript-eslint/parameter-properties, quotes */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const utils_1 = require("@streamr/utils");
const errors_1 = require("./errors");
const os_1 = __importDefault(require("os"));
const logger = new utils_1.Logger(module);
class Database {
    constructor(filePath) {
        if (filePath.startsWith('~/')) {
            this.databaseFilePath = filePath.replace('~', os_1.default.homedir());
        }
        else {
            this.databaseFilePath = filePath;
        }
    }
    async createSubdomain(subdomain, ip, port, token) {
        try {
            await this.createSubdomainStatement.run(subdomain, ip, port, token);
        }
        catch (e) {
            const err = new errors_1.DatabaseError('Failed to create subdomain ' + subdomain, e);
            throw err;
        }
        logger.info('Subdomain created: ' + subdomain);
    }
    async getSubdomain(subdomain) {
        let ret;
        try {
            ret = await this.getSubdomainStatement.get(subdomain);
        }
        catch (e) {
            const err = new errors_1.DatabaseError('Failed to get subdomain ' + subdomain, e);
            throw err;
        }
        if (!ret) {
            const err = new errors_1.DatabaseError('Subdomain not found ' + subdomain);
            throw err;
        }
        return ret;
    }
    async getSubdomainWithToken(subdomain, token) {
        let ret;
        try {
            ret = await this.getSubdomainWithTokenStatement.get(subdomain, token);
        }
        catch (e) {
            const err = new errors_1.DatabaseError('Failed to get subdomain ' + subdomain, e);
            throw err;
        }
        if (!ret) {
            const err = new errors_1.DatabaseError('Subdomain not found ' + subdomain);
            throw err;
        }
        return ret;
    }
    async updateSubdomainIpAndPort(subdomain, ip, port, token) {
        //let result: Awaited<ReturnType<Statement<sqlite3.Statement>['run']>> | undefined  
        try {
            await this.getSubdomainWithToken(subdomain, token);
        }
        catch (e) {
            const err = new errors_1.InvalidSubdomainOrToken('Invalid subdomain or token ' + subdomain, e);
            throw err;
        }
        try {
            await this.updateSubdomainIpAndPortStatement.run(ip, port, subdomain, token);
        }
        catch (e) {
            const err = new errors_1.DatabaseError('Failed to update subdomain ' + subdomain, e);
            throw err;
        }
        logger.info('Subdomain ip and port updated');
    }
    async updateSubdomainAcmeChallenge(subdomain, acmeChallenge) {
        logger.info('Updating subdomain acme challenge for ' + subdomain);
        try {
            await this.updateSubdomainAcmeChallengeStatement.run(acmeChallenge, subdomain);
        }
        catch (e) {
            const err = new errors_1.DatabaseError('Failed to update subdomain Acme challenge' + subdomain, e);
            throw err;
        }
        logger.info('Subdomain acme challenge updated');
    }
    async start() {
        this.db = await (0, sqlite_1.open)({
            filename: this.databaseFilePath,
            driver: sqlite3_1.default.Database
        });
        const result = await this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", "subdomains");
        if (!result) {
            await this.createTables();
        }
        this.createSubdomainStatement = await this.db.prepare("INSERT INTO subdomains (subdomainName, ip, port, token) VALUES (?, ?, ?, ?)");
        this.getSubdomainStatement = await this.db.prepare("SELECT * FROM subdomains WHERE subdomainName = ?");
        this.getSubdomainWithTokenStatement = await this.db.prepare("SELECT * FROM subdomains WHERE subdomainName = ? AND token = ?");
        this.updateSubdomainIpAndPortStatement = await this.db.prepare("UPDATE subdomains SET ip = ?, port = ? WHERE subdomainName = ? AND token = ?");
        this.getSubdomainAcmeChallengeStatement = await this.db.prepare("SELECT acmeChallenge FROM subdomains WHERE subdomainName = ?");
        this.updateSubdomainAcmeChallengeStatement = await this.db.prepare("UPDATE subdomains SET acmeChallenge = ? WHERE subdomainName = ?");
        logger.info('Database is running');
    }
    async stop() {
        if (this.createSubdomainStatement) {
            await this.createSubdomainStatement.finalize();
        }
        if (this.getSubdomainStatement) {
            await this.getSubdomainStatement.finalize();
        }
        if (this.getSubdomainWithTokenStatement) {
            await this.getSubdomainWithTokenStatement.finalize();
        }
        if (this.updateSubdomainIpAndPortStatement) {
            await this.updateSubdomainIpAndPortStatement.finalize();
        }
        if (this.getSubdomainAcmeChallengeStatement) {
            await this.getSubdomainAcmeChallengeStatement.finalize();
        }
        if (this.updateSubdomainAcmeChallengeStatement) {
            await this.updateSubdomainAcmeChallengeStatement.finalize();
        }
        if (this.db) {
            await this.db.close();
        }
    }
    async createTables() {
        let query = "BEGIN TRANSACTION; ";
        query += "CREATE TABLE subdomains (";
        query += "id INTEGER PRIMARY KEY,";
        query += "subdomainName TEXT NOT NULL,";
        query += "ip TEXT NOT NULL,";
        query += "port TEXT NOT NULL,";
        query += "token TEXT NOT NULL,";
        query += "acmeChallenge TEXT,";
        query += "createdAt DATETIME DEFAULT CURRENT_TIMESTAMP); ";
        query += "CREATE INDEX subdomain_index on subdomains(subdomainName); ";
        query += "COMMIT;";
        await this.db.exec(query);
    }
}
exports.Database = Database;
//# sourceMappingURL=Database.js.map