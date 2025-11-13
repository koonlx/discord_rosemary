const { eq, sql } = require('drizzle-orm');
const { db } = require('./db/client');
const { partyRecruit } = require('./db/schema');

const rowsToCountMap = (rows) => {
  const counts = new Map();
  rows.forEach((row) => {
    counts.set(row.kind, Number(row.count));
  });
  return counts;
};

const fetchRecruitCountsByKind = async () => {
  try {
    const rows = await db
      .select({
        kind: partyRecruit.kind,
        count: sql`CAST(COUNT(*) AS INTEGER)`.as('count'),
      })
      .from(partyRecruit)
      .where(eq(partyRecruit.isCompleted, 0))
      .groupBy(partyRecruit.kind);

    return rowsToCountMap(rows);
  } catch (error) {
    console.error('Failed to load party recruit counts:', error);
    return new Map();
  }
};

module.exports = {
  fetchRecruitCountsByKind,
};
