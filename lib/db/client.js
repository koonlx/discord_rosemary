const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const config = require('../config');
const { runMigrations } = require('./migrations');

const ensureDatabaseDirectory = filePath => {
   const directory = path.dirname(filePath);
   if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
   }
};

ensureDatabaseDirectory(config.databasePath);

const sqlite = new Database(config.databasePath);
runMigrations(sqlite);
const db = drizzle(sqlite);

module.exports = {
   db,
};
