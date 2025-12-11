const { and, desc, eq, inArray, sql } = require('drizzle-orm');
const { db } = require('./db/client');
const { users, partyRecruit, members } = require('./db/schema');
const { isRecruitManager, getDiscordId } = require('./permissions');

const findUserRecordId = async discordUserId => {
   const discordId = String(discordUserId);
   const existingRows = await db.select({ id: users.id }).from(users).where(eq(users.name, discordId)).limit(1);
   return existingRows.length ? existingRows[0].id : null;
};

const ensureUserRecord = async discordUser => {
   const discordId = getDiscordId(discordUser);
   if (!discordId) {
      throw new Error('Invalid Discord user.');
   }

   const existingId = await findUserRecordId(discordId);
   if (existingId) {
      return existingId;
   }

   const result = await db.insert(users).values({ name: discordId }).run();

   return Number(result.lastInsertRowid);
};

const sanitizeApplicantDiscordIds = (ids = [], hostDiscordId = null) => {
   if (!Array.isArray(ids)) {
      return [];
   }

   const blockedId = hostDiscordId ? String(hostDiscordId) : null;
   const seen = new Set();
   const result = [];

   ids.forEach(id => {
      if (!id) {
         return;
      }

      const discordId = String(id);
      if (blockedId && discordId === blockedId) {
         return;
      }

      if (seen.has(discordId)) {
         return;
      }

      seen.add(discordId);
      result.push(discordId);
   });

   return result;
};

const replaceRecruitMembers = async ({
   recruitId,
   applicantDiscordIds = [],
   hostDiscordId,
   preSanitizedIds = null,
}) => {
   const sanitizedIds = preSanitizedIds ?? sanitizeApplicantDiscordIds(applicantDiscordIds, hostDiscordId);
   const userIds = await Promise.all(sanitizedIds.map(discordId => ensureUserRecord(discordId)));

   await db.transaction(async tx => {
      await tx.delete(members).where(eq(members.partyTableId, recruitId));

      if (!userIds.length) {
         return;
      }

      await Promise.all(
         userIds.map(userId =>
            tx
               .insert(members)
               .values({
                  userId,
                  partyTableId: recruitId,
               })
               .run(),
         ),
      );
   });

   return sanitizedIds;
};

const createPartyRecruitEntry = async ({
   discordUser,
   title,
   time,
   kind,
   condition,
   memberLimit,
   hostDiscordId,
   applicantDiscordIds,
}) => {
   if (hostDiscordId && !isRecruitManager(discordUser)) {
      throw new Error('Only recruit managers can change the host.');
   }

   if (Array.isArray(applicantDiscordIds) && !isRecruitManager(discordUser)) {
      throw new Error('Only recruit managers can manage applicants.');
   }

   const hostTargetDiscordId = hostDiscordId || getDiscordId(discordUser);
   const userId = await ensureUserRecord(hostTargetDiscordId);

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

   const recruitId = Number(result.lastInsertRowid);

   if (Array.isArray(applicantDiscordIds) && applicantDiscordIds.length) {
      await replaceRecruitMembers({
         recruitId,
         applicantDiscordIds,
         hostDiscordId: hostTargetDiscordId,
      });
   }

   return {
      id: recruitId,
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

const canManageRecruitEntry = (entry, discordUser) => {
   const discordId = getDiscordId(discordUser);
   if (!discordId) {
      return false;
   }

   return entry.userDiscordId === discordId || isRecruitManager(discordUser);
};

const updatePartyRecruitEntry = async ({
   recruitId,
   discordUser,
   title,
   time,
   condition,
   memberLimit,
   hostDiscordId,
   applicantDiscordIds,
}) => {
   const entry = await fetchPartyRecruitEntryById(recruitId);
   if (!entry) {
      throw new Error('Recruit entry not found.');
   }

   if (!canManageRecruitEntry(entry, discordUser)) {
      throw new Error('You can only modify your own recruit entries.');
   }

   if (Array.isArray(applicantDiscordIds) && !isRecruitManager(discordUser)) {
      throw new Error('Only recruit managers can manage applicants.');
   }

   const updatePayload = {
      title,
      time,
      condition: condition || null,
      memberLimit,
      isCompleted: 0,
   };
   let updatedHostDiscordId = entry.userDiscordId;

   if (hostDiscordId) {
      if (!isRecruitManager(discordUser)) {
         throw new Error('Only recruit managers can change the host.');
      }

      const newHostUserId = await ensureUserRecord(hostDiscordId);
      updatePayload.userId = newHostUserId;
      updatedHostDiscordId = hostDiscordId;
   }

   const sanitizedMembers = Array.isArray(applicantDiscordIds)
      ? sanitizeApplicantDiscordIds(applicantDiscordIds, updatedHostDiscordId)
      : null;
   const effectiveMemberCount = sanitizedMembers !== null ? sanitizedMembers.length + 1 : entry.memberCount;

   if (memberLimit < effectiveMemberCount) {
      throw new Error('Member limit cannot be lower than current members.');
   }

   const shouldBeCompleted = effectiveMemberCount >= memberLimit;
   updatePayload.isCompleted = shouldBeCompleted ? 1 : 0;

   await db.update(partyRecruit).set(updatePayload).where(eq(partyRecruit.id, recruitId));

   if (sanitizedMembers !== null) {
      await replaceRecruitMembers({
         recruitId,
         applicantDiscordIds,
         hostDiscordId: updatedHostDiscordId,
         preSanitizedIds: sanitizedMembers,
      });
      entry.members = sanitizedMembers;
      entry.memberCount = effectiveMemberCount;
   }

   return {
      ...entry,
      title,
      time,
      condition,
      memberLimit,
      isCompleted: shouldBeCompleted,
      userDiscordId: updatedHostDiscordId,
   };
};

const deletePartyRecruitEntry = async ({ recruitId, discordUser }) => {
   const entry = await fetchPartyRecruitEntryById(recruitId);
   if (!entry) {
      throw new Error('Recruit entry not found.');
   }

   if (!canManageRecruitEntry(entry, discordUser)) {
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

   const discordId = getDiscordId(discordUser);
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

   const discordId = getDiscordId(discordUser);
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
