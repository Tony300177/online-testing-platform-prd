const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });
const { db } = require("../drizzle.config.ts"); // no

(async () => {
  process.exit(0);
})();