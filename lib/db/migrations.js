const migrations = [
  `CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    );`,
  `CREATE TABLE IF NOT EXISTS party_recruit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      time TEXT NOT NULL,
      kind INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );`,
  `CREATE TABLE IF NOT EXISTS member (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      party_table_id INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (party_table_id) REFERENCES party_recruit(id)
    );`,
];

const runMigrations = (database) => {
  database.pragma('foreign_keys = ON');
  migrations.forEach((statement) => {
    database.exec(statement);
  });
};

module.exports = {
  runMigrations,
};
