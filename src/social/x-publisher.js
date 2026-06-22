const fs = require("fs");
const { TwitterApi } = require("twitter-api-v2");
const { buildContextualFinalScoreCaption } = require("./caption");
const { getInternalContext } = require("./match-context");
const { writeEditorialHeadline } = require("./editorial-writer");

function getPostMode() {
  return process.env.X_POST_MODE || "manual";
}

function hasXCredentials() {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_TOKEN_SECRET,
  );
}

function getXClient() {
  if (!hasXCredentials()) {
    return null;
  }

  return new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

function validatePostInput({ matchData, imagePath }) {
  if (!matchData) {
    throw new Error("Missing matchData for X post.");
  }

  if (matchData.match?.status !== "FINAL") {
    throw new Error(`X post blocked because status is ${matchData.match?.status || "unknown"}.`);
  }

  if (!matchData.competition?.groupLetter) {
    throw new Error("X post blocked because groupLetter is missing.");
  }

  if (!matchData.teams?.home?.name || !matchData.teams?.away?.name) {
    throw new Error("X post blocked because team names are missing.");
  }

  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error("X post blocked because imagePath does not exist.");
  }
}

async function publishFinalScorePost({ matchData, imagePath, recentEditorialSignatures, headlineOverride } = {}) {
  validatePostInput({ matchData, imagePath });

  const mode = getPostMode();
  const fallbackContext = getInternalContext(matchData, { recentEditorialSignatures });
  const context =
    headlineOverride
      ? {
          ...fallbackContext,
          headline: String(headlineOverride).trim(),
          source: `manual-headline-override+${fallbackContext.source}`,
          signature: `manual-headline-override:${matchData.source?.eventId || "unknown"}`,
          decision: {
            ...(fallbackContext.decision || {}),
            manualHeadlineOverride: true,
          },
        }
      : mode === "paused"
        ? fallbackContext
        : await writeEditorialHeadline({
            matchData,
            context: fallbackContext,
            recentEditorialSignatures,
          });
  const text = buildContextualFinalScoreCaption(matchData, context);

  if (mode === "paused") {
    return {
      published: false,
      mode,
      text,
      editorialContext: context,
      reason: "X posting is paused.",
    };
  }

  if (mode === "manual") {
    return {
      published: false,
      mode,
      text,
      editorialContext: context,
      reason: "Manual mode: post was prepared but not published.",
    };
  }

  if (mode !== "auto") {
    throw new Error(`Unknown X_POST_MODE: ${mode}`);
  }

  const client = getXClient();
  if (!client) {
    throw new Error("Missing X/Twitter credentials.");
  }

  const mediaId = await client.v2.uploadMedia(fs.readFileSync(imagePath), {
    media_type: "image/webp",
    media_category: "tweet_image",
  });
  const tweet = await client.v2.tweet({
    text,
    media: {
      media_ids: [mediaId],
    },
  });

  return {
    published: true,
    mode,
    text,
    editorialContext: context,
    tweetId: tweet.data.id,
    tweetUrl: `https://x.com/i/web/status/${tweet.data.id}`,
  };
}

function buildTopScorersCaption(matchday, leaders = []) {
  const leader = leaders[0];
  const leaderLine = leader ? `${leader.name} lidera con ${leader.goals} goles` : "Tabla de goleo actualizada";
  return `${leaderLine} tras la Jornada ${matchday} del Mundial 2026.`;
}

async function publishTopScorersPost({ matchday, imagePath, leaders = [] } = {}) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error("Top scorers X post blocked because imagePath does not exist.");
  }

  const mode = getPostMode();
  const text = buildTopScorersCaption(matchday, leaders);

  if (process.env.TOP_SCORERS_X_ENABLED === "false") {
    return {
      published: false,
      mode,
      text,
      reason: "Top scorers X posting is disabled.",
    };
  }

  if (mode === "paused") {
    return {
      published: false,
      mode,
      text,
      reason: "X posting is paused.",
    };
  }

  if (mode === "manual") {
    return {
      published: false,
      mode,
      text,
      reason: "Manual mode: top scorers post was prepared but not published.",
    };
  }

  if (mode !== "auto") {
    throw new Error(`Unknown X_POST_MODE: ${mode}`);
  }

  const client = getXClient();
  if (!client) {
    throw new Error("Missing X/Twitter credentials.");
  }

  const mediaId = await client.v2.uploadMedia(fs.readFileSync(imagePath), {
    media_type: "image/webp",
    media_category: "tweet_image",
  });
  const tweet = await client.v2.tweet({
    text,
    media: {
      media_ids: [mediaId],
    },
  });

  return {
    published: true,
    mode,
    text,
    tweetId: tweet.data.id,
    tweetUrl: `https://x.com/i/web/status/${tweet.data.id}`,
  };
}

async function verifyXPublisherAccount() {
  const mode = getPostMode();

  if (!hasXCredentials()) {
    return {
      ok: false,
      mode,
      reason: "Missing X/Twitter credentials.",
    };
  }

  try {
    const client = getXClient();
    const me = await client.v2.me();
    return {
      ok: true,
      mode,
      id: me.data.id,
      username: me.data.username,
      name: me.data.name,
    };
  } catch (error) {
    return {
      ok: false,
      mode,
      reason: error.message,
    };
  }
}

module.exports = {
  buildFinalScoreCaption: (matchData) => buildContextualFinalScoreCaption(matchData, getInternalContext(matchData)),
  publishFinalScorePost,
  publishTopScorersPost,
  verifyXPublisherAccount,
};
