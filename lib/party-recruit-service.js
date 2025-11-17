const { and, desc, eq, inArray, sql } = require('drizzle-orm');
const { db } = require('./db/client');
const { users, partyRecruit, members } = require('./db/schema');

const findUserRecordId = async discordUserId => {
   const discordId = String(discordUserId);
   const existingRows = await db.select({ id: users.id }).from(users).where(eq(users.name, discordId)).limit(1);
   return existingRows.length ? existingRows[0].id : null;
};

const ensureUserRecord = async discordUser => {
   const discordId = String(discordUser.id);

   const existingId = await findUserRecordId(discordId);
   if (existingId) {
      return existingId;
   }

   const result = await db.insert(users).values({ name: discordId }).run();

   return Number(result.lastInsertRowid);
};

const createPartyRecruitEntry = async ({ discordUser, title, time, kind, condition, memberLimit }) => {
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
         isCompleted: memberLimit <= 1 ? 1 : 0,
      })
      .run();

   return {
      id: Number(result.lastInsertRowid),
      userId,
   };
};

const normalizeEntries = (rows = []) =>
   rows.map(row => {
      const applicantCount = Number(row.memberCount ?? 0);
      const memberLimit = Number(row.memberLimit ?? 0);

      return {
         ...row,
         memberCount: applicantCount + 1,
         applicantCount,
         memberLimit,
         isCompleted: Boolean(row.isCompleted),
      };
   });

const buildRecruitSelectFields = () => {
   const memberCountExpr = sql`CAST(COALESCE(COUNT(${members.id}), 0) AS INTEGER)`.as('memberCount');

   return {
      id: partyRecruit.id,
      kind: partyRecruit.kind,
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
   const updates = entries.filter(entry => {
      const shouldBeCompleted = entry.memberCount >= entry.memberLimit;
      return shouldBeCompleted !== entry.isCompleted;
   });

   if (!updates.length) {
      return;
   }

   await Promise.all(
      updates.map(entry =>
         db
            .update(partyRecruit)
            .set({ isCompleted: entry.memberCount >= entry.memberLimit ? 1 : 0 })
            .where(eq(partyRecruit.id, entry.id)),
      ),
   );

   updates.forEach(entry => {
      entry.isCompleted = entry.memberCount >= entry.memberLimit;
   });
};

const attachMembersToEntries = async entries => {
   if (!entries.length) {
      return;
   }

   const recruitIds = [...new Set(entries.map(entry => entry.id).filter(Boolean))];
   if (!recruitIds.length) {
      entries.forEach(entry => {
         entry.members = [];
      });
      return;
   }

   const rows = await db
      .select({
         recruitId: members.partyTableId,
         memberDiscordId: users.name,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(inArray(members.partyTableId, recruitIds))
      .orderBy(members.id);

   const membersByRecruitId = new Map();
   rows.forEach(row => {
      if (!row.recruitId || !row.memberDiscordId) {
         return;
      }

      const currentMembers = membersByRecruitId.get(row.recruitId) || [];
      currentMembers.push(row.memberDiscordId);
      membersByRecruitId.set(row.recruitId, currentMembers);
   });

   entries.forEach(entry => {
      entry.members = membersByRecruitId.get(entry.id) || [];
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
         partyRecruit.kind,
         partyRecruit.title,
         partyRecruit.time,
         partyRecruit.condition,
         partyRecruit.memberLimit,
         partyRecruit.isCompleted,
         users.name,
      );

const fetchPartyRecruitEntriesByKind = async ({ kind, limit = 10 }) => {
   const rows = await baseRecruitQuery().where(eq(partyRecruit.kind, kind)).orderBy(desc(partyRecruit.id)).limit(limit);

   const normalizedEntries = normalizeEntries(rows);
   await syncCompletionFlags(normalizedEntries);
   await attachMembersToEntries(normalizedEntries);
   return normalizedEntries;
};

const fetchPartyRecruitsByUser = async ({ discordUserId, kind }) => {
   const baseCondition = eq(users.name, String(discordUserId));
   const whereClause = typeof kind === 'number' ? and(baseCondition, eq(partyRecruit.kind, kind)) : baseCondition;

   const rows = await baseRecruitQuery().where(whereClause).orderBy(desc(partyRecruit.id)).limit(25);

   const normalizedEntries = normalizeEntries(rows);
   await syncCompletionFlags(normalizedEntries);
   await attachMembersToEntries(normalizedEntries);
   return normalizedEntries;
};

const fetchPartyRecruitsByMember = async ({ discordUserId, kind }) => {
   const userId = await findUserRecordId(discordUserId);
   if (!userId) {
      return [];
   }

   const recruitIdRows = await db
      .select({ recruitId: members.partyTableId })
      .from(members)
      .where(eq(members.userId, userId));

   const recruitIds = [...new Set(recruitIdRows.map(row => row.recruitId).filter(Boolean))];
   if (!recruitIds.length) {
      return [];
   }

   const idCondition = inArray(partyRecruit.id, recruitIds);
   const whereClause = typeof kind === 'number' ? and(eq(partyRecruit.kind, kind), idCondition) : idCondition;

   const rows = await baseRecruitQuery().where(whereClause).orderBy(desc(partyRecruit.id)).limit(25);

   const normalizedEntries = normalizeEntries(rows);
   await syncCompletionFlags(normalizedEntries);
   await attachMembersToEntries(normalizedEntries);
   return normalizedEntries;
};

const fetchPartyRecruitEntryById = async id => {
   const rows = await baseRecruitQuery().where(eq(partyRecruit.id, id)).limit(1);

   const normalizedEntries = normalizeEntries(rows);
   await syncCompletionFlags(normalizedEntries);
   await attachMembersToEntries(normalizedEntries);
   return normalizedEntries[0];
};

const updatePartyRecruitEntry = async ({ recruitId, discordUser, title, time, condition, memberLimit }) => {
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

   await db.transaction(async tx => {
      await tx.delete(members).where(eq(members.partyTableId, recruitId));
      await tx.delete(partyRecruit).where(eq(partyRecruit.id, recruitId));
   });

   return entry;
};

const joinPartyRecruit = async ({ recruitId, discordUser }) => {
   const entry = await fetchPartyRecruitEntryById(recruitId);
   if (!entry) {
      throw new Error('Recruit entry not found.');
   }

   const discordId = String(discordUser.id);
   if (entry.userDiscordId === discordId) {
      throw new Error('You cannot join your own party.');
   }

   if (entry.memberCount >= entry.memberLimit || entry.isCompleted) {
      throw new Error('Party is already full.');
   }

   const userId = await ensureUserRecord(discordUser);

   const existingMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.partyTableId, recruitId), eq(members.userId, userId)))
      .limit(1);

   if (existingMembership.length) {
      throw new Error('You have already joined this party.');
   }

   await db
      .insert(members)
      .values({
         userId,
         partyTableId: recruitId,
      })
      .run();

   return fetchPartyRecruitEntryById(recruitId);
};

const cancelPartyRecruitApplication = async ({ recruitId, discordUser }) => {
   const entry = await fetchPartyRecruitEntryById(recruitId);
   if (!entry) {
      throw new Error('Recruit entry not found.');
   }

   const discordId = String(discordUser.id);
   if (entry.userDiscordId === discordId) {
      throw new Error('You cannot cancel your own party.');
   }

   const userId = await ensureUserRecord(discordUser);

   const existingMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.partyTableId, recruitId), eq(members.userId, userId)))
      .limit(1);

   if (!existingMembership.length) {
      throw new Error('You are not a member of this party.');
   }

   await db.delete(members).where(eq(members.id, existingMembership[0].id));

   return fetchPartyRecruitEntryById(recruitId);
};

module.exports = {
   createPartyRecruitEntry,
   fetchPartyRecruitEntriesByKind,
   fetchPartyRecruitsByUser,
   fetchPartyRecruitsByMember,
   fetchPartyRecruitEntryById,
   updatePartyRecruitEntry,
   deletePartyRecruitEntry,
   joinPartyRecruit,
   cancelPartyRecruitApplication,
};
