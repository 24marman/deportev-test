const fs = require("fs");
const { TwitterApi } = require("twitter-api-v2");
const { buildContextualFinalScoreCaption } = require("./caption");
const { getInternalContext } = require("./match-context");

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

async function publishFinalScorePost({ matchData, imagePath }) {
  validatePostInput({ matchData, imagePath });

  const mode = getPostMode();
  const context = getInternalContext(matchData);
  const text = buildContextualFinalScoreCaption(matchData, context);

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

  const mediaId = await client.v1.uploadMedia(imagePath, {
    mimeType: "image/webp",
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

module.exports = {
  buildFinalScoreCaption: (matchData) => buildContextualFinalScoreCaption(matchData, getInternalContext(matchData)),
  publishFinalScorePost,
};
