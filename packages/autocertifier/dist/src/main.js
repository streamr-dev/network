"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AutoCertifier_1 = require("./AutoCertifier");
const autoCertifier = new AutoCertifier_1.AutoCertifier();
autoCertifier.start().catch((err) => {
    console.error(err);
});
//# sourceMappingURL=main.js.map