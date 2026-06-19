const { buildPriorGroupContext, buildTournamentContext } = require("./competition-context");
const { getInternalContext } = require("./match-context");

function getWarmupAgeMinutes(record, now = Date.now()) {
  const value = record?.editorialWarmedAt;
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (now - time) / 60000;
}

function shouldWarmEditorialContext(record, status) {
  if (record?.processedAt) return false;
  const normalized = String(status || record?.status || "").toLowerCase();
  const warmStatuses = new Set(["2nd_half", "second_half", "inprogress", "halftime"]);
  if (!warmStatuses.has(normalized)) return false;

  const everyMinutes = Number(process.env.EDITORIAL_WARMUP_REFRESH_MINUTES || "20");
  return getWarmupAgeMinutes(record) >= Math.max(5, everyMinutes);
}

async function warmEditorialContext({ eventId, fetchMatchData, contextEvents }) {
  const startedAt = Date.now();
  const matchData = await fetchMatchData(eventId);

  matchData.context = {
    ...(matchData.context || {}),
    priorGroup: buildPriorGroupContext(matchData, contextEvents || []),
    tournament: buildTournamentContext(matchData, contextEvents || []),
  };

  const context = getInternalContext(matchData);

  return {
    warmedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    matchData,
    context,
  };
}

function applyWarmEditorialContext(matchData, warmedRecord) {
  if (!warmedRecord?.editorialContext) return matchData;

  matchData.context = {
    ...(matchData.context || {}),
    warmedEditorial: {
      warmedAt: warmedRecord.editorialWarmedAt || null,
      context: warmedRecord.editorialContext,
    },
  };

  return matchData;
}

module.exports = {
  applyWarmEditorialContext,
  shouldWarmEditorialContext,
  warmEditorialContext,
};
