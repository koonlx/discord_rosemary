const createTables = database => {
   database.exec(`CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    );`);

   database.exec(`CREATE TABLE IF NOT EXISTS party_recruit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      time TEXT NOT NULL,
      kind INTEGER NOT NULL,
      condition TEXT,
      member_limit INTEGER NOT NULL DEFAULT 1,
      is_completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );`);

   database.exec(`CREATE TABLE IF NOT EXISTS member (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      party_table_id INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id),
      FOREIGN KEY (party_table_id) REFERENCES party_recruit(id)
    );`);
};

const createPartyCompletionTriggers = database => {
   database.exec('DROP TRIGGER IF EXISTS member_insert_marks_complete;');
   database.exec('DROP TRIGGER IF EXISTS member_delete_reopens_party;');

   database.exec(`CREATE TRIGGER IF NOT EXISTS member_insert_marks_complete
    AFTER INSERT ON member
    BEGIN
      UPDATE party_recruit
        SET is_completed = 1
        WHERE id = NEW.party_table_id
          AND (
            SELECT COUNT(*)
            FROM member
            WHERE party_table_id = NEW.party_table_id
          ) >= (CASE WHEN member_limit > 0 THEN member_limit - 1 ELSE 0 END);
    END;`);

   database.exec(`CREATE TRIGGER IF NOT EXISTS member_delete_reopens_party
    AFTER DELETE ON member
    BEGIN
      UPDATE party_recruit
        SET is_completed = 0
        WHERE id = OLD.party_table_id
          AND (
            SELECT COUNT(*)
            FROM member
            WHERE party_table_id = OLD.party_table_id
          ) < (CASE WHEN member_limit > 0 THEN member_limit - 1 ELSE 0 END);
    END;`);
};

const ensurePartyRecruitColumns = database => {
   const columns = database.prepare("PRAGMA table_info('party_recruit')").all();
   const hasColumn = name => columns.some(column => column.name === name);

   if (!hasColumn('condition')) {
      database.exec('ALTER TABLE party_recruit ADD COLUMN condition TEXT;');
   }

   if (!hasColumn('member_limit')) {
      database.exec('ALTER TABLE party_recruit ADD COLUMN member_limit INTEGER NOT NULL DEFAULT 1;');
      database.exec('UPDATE party_recruit SET member_limit = 1 WHERE member_limit IS NULL;');
   }

   if (!hasColumn('is_completed')) {
      database.exec('ALTER TABLE party_recruit ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0;');
      database.exec('UPDATE party_recruit SET is_completed = 0 WHERE is_completed IS NULL;');
   }
};

const ensureMemberIndexes = database => {
   database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_member_user_party ON member(user_id, party_table_id);');
};

const runMigrations = database => {
   database.pragma('foreign_keys = ON');
   createTables(database);
   ensurePartyRecruitColumns(database);
   createPartyCompletionTriggers(database);
   ensureMemberIndexes(database);
};

module.exports = {
   runMigrations,
};
