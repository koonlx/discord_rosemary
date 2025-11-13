const {
  and,
  desc,
  eq,
  sql,
} = require('drizzle-orm');
const { db } = require('./db/client');
const {
  users,
  partyRecruit,
  members,
} = require('./db/schema');

const ensureUserRecord = async (discordUser) => {
  const discordId = String(discordUser.id);

  const existingRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.name, discordId))
    .limit(1);

  if (existingRows.length) {
    return existingRows[0].id;
  }

  const result = await db
    .insert(users)
    .values({ name: discordId })
    .run();

  return Number(result.lastInsertRowid);
};

const createPartyRecruitEntry = async ({
  discordUser,
  title,
  time,
  kind,
  condition,
  memberLimit,
}) => {
  const userId = await ensureUserRecord(discordUser);

  const result = await db
    .insert(partyRecruit)
    .values({
      userId,
      title,
      time,
      kind,
      condition: condition || null,
      memberLimit,
      isCompleted: 0,
    })
    .run();

  return {
    id: Number(result.lastInsertRowid),
    userId,
  };
};

const normalizeEntries = (rows = []) =>
  rows.map((row) => ({
    ...row,
    memberCount: Number(row.memberCount ?? 0),
    memberLimit: Number(row.memberLimit ?? 0),
    isCompleted: Boolean(row.isCompleted),
  }));

const buildRecruitSelectFields = () => {
  const memberCountExpr = sql`CAST(COALESCE(COUNT(${members.id}), 0) AS INTEGER)`.as('memberCount');

  return {
    id: partyRecruit.id,
    title: partyRecruit.title,
    time: partyRecruit.time,
    condition: partyRecruit.condition,
    memberLimit: partyRecruit.memberLimit,
    isCompleted: partyRecruit.isCompleted,
    memberCount: memberCountExpr,
    userDiscordId: users.name,
  };
};

const syncCompletionFlags = async (entries = []) => {
  const updates = entries.filter((entry) => {
    const shouldBeCompleted = entry.memberCount >= entry.memberLimit;
    return shouldBeCompleted !== entry.isCompleted;
  });

  if (!updates.length) {
    return;
  }

  await Promise.all(
    updates.map((entry) =>
      db
        .update(partyRecruit)
        .set({ isCompleted: entry.memberCount >= entry.memberLimit ? 1 : 0 })
        .where(eq(partyRecruit.id, entry.id)),
    ),
  );

  updates.forEach((entry) => {
    entry.isCompleted = entry.memberCount >= entry.memberLimit;
  });
};

const baseRecruitQuery = () =>
  db
    .select(buildRecruitSelectFields())
    .from(partyRecruit)
    .leftJoin(users, eq(partyRecruit.userId, users.id))
    .leftJoin(members, eq(members.partyTableId, partyRecruit.id))
    .groupBy(
      partyRecruit.id,
      partyRecruit.title,
      partyRecruit.time,
      partyRecruit.condition,
      partyRecruit.memberLimit,
      partyRecruit.isCompleted,
      users.name,
    );

const fetchPartyRecruitEntriesByKind = async ({ kind, limit = 10 }) => {
  const rows = await baseRecruitQuery()
    .where(eq(partyRecruit.kind, kind))
    .orderBy(desc(partyRecruit.id))
    .limit(limit);

  const normalizedEntries = normalizeEntries(rows);
  await syncCompletionFlags(normalizedEntries);
  return normalizedEntries;
};

const fetchPartyRecruitsByUser = async ({ discordUserId, kind }) => {
  const baseCondition = eq(users.name, String(discordUserId));
  const whereClause = typeof kind === 'number'
    ? and(baseCondition, eq(partyRecruit.kind, kind))
    : baseCondition;

  const rows = await baseRecruitQuery()
    .where(whereClause)
    .orderBy(desc(partyRecruit.id))
    .limit(25);

  const normalizedEntries = normalizeEntries(rows);
  await syncCompletionFlags(normalizedEntries);
  return normalizedEntries;
};

const fetchPartyRecruitEntryById = async (id) => {
  const rows = await baseRecruitQuery()
    .where(eq(partyRecruit.id, id))
    .limit(1);

  const normalizedEntries = normalizeEntries(rows);
  await syncCompletionFlags(normalizedEntries);
  return normalizedEntries[0];
};

const updatePartyRecruitEntry = async ({
  recruitId,
  discordUser,
  title,
  time,
  condition,
  memberLimit,
}) => {
  const entry = await fetchPartyRecruitEntryById(recruitId);
  if (!entry) {
    throw new Error('Recruit entry not found.');
  }

  if (entry.userDiscordId !== String(discordUser.id)) {
    throw new Error('You can only modify your own recruit entries.');
  }

  if (memberLimit < entry.memberCount) {
    throw new Error('Member limit cannot be lower than current members.');
  }

  const shouldBeCompleted = entry.memberCount >= memberLimit;

  await db
    .update(partyRecruit)
    .set({
      title,
      time,
      condition: condition || null,
      memberLimit,
      isCompleted: shouldBeCompleted ? 1 : 0,
    })
    .where(eq(partyRecruit.id, recruitId));

  return {
    ...entry,
    title,
    time,
    condition,
    memberLimit,
    isCompleted: shouldBeCompleted,
  };
};

const deletePartyRecruitEntry = async ({ recruitId, discordUser }) => {
  const entry = await fetchPartyRecruitEntryById(recruitId);
  if (!entry) {
    throw new Error('Recruit entry not found.');
  }

  if (entry.userDiscordId !== String(discordUser.id)) {
    throw new Error('You can only delete your own recruit entries.');
  }

  await db.transaction(async (tx) => {
    await tx.delete(members).where(eq(members.partyTableId, recruitId));
    await tx.delete(partyRecruit).where(eq(partyRecruit.id, recruitId));
  });

  return entry;
};

module.exports = {
  createPartyRecruitEntry,
  fetchPartyRecruitEntriesByKind,
  fetchPartyRecruitsByUser,
  fetchPartyRecruitEntryById,
  updatePartyRecruitEntry,
  deletePartyRecruitEntry,
};
