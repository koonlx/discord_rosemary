const {
  integer,
  sqliteTable,
  text,
} = require('drizzle-orm/sqlite-core');

const users = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name', { length: 45 }),
});

const partyRecruit = sqliteTable('party_recruit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title', { length: 255 }).notNull(),
  time: text('time', { length: 255 }).notNull(),
  kind: integer('kind').notNull(),
  condition: text('condition', { length: 255 }),
  memberLimit: integer('member_limit').notNull(),
  isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
});

const members = sqliteTable('member', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  partyTableId: integer('party_table_id')
    .notNull()
    .references(() => partyRecruit.id),
});

module.exports = {
  users,
  partyRecruit,
  members,
};
