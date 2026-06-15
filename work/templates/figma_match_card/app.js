const matchData = {
  competition: {
    name: "COPA MUNDIAL",
    year: "2026",
    phase: "FASE DE GRUPOS",
    groupLetter: "B",
    matchdayNumber: "1",
  },
  match: {
    status: "FINAL",
    venue: {
      name: "SAN FRANCISCO BAY AREA STADIUM",
      image: "./assets/backgrounds/san-francisco.webp",
    },
  },
  teams: {
    home: {
      name: "ARGENTINA",
      score: 0,
      code: "ARG",
      iso2: "ar",
      flag: "./assets/flags/ar.svg",
    },
    away: {
      name: "QATAR",
      score: 0,
      code: "QAT",
      iso2: "qa",
      flag: "./assets/flags/qa.svg",
    },
  },
  events: {
    homeScorers: [
      { minute: "73'", player: "JUGADOR UNO" },
      { minute: "73'", player: "JUGADOR UNO", goalType: "penalty" },
      { minute: "73'", player: "JUGADOR UNO", goalType: "ownGoal" },
    ],
    awayScorers: [{ minute: "73'", player: "JUGADOR UNO", goalType: "penalty" }],
  },
};

function getPath(source, path) {
  return path.split(".").reduce((value, key) => (value == null ? value : value[key]), source);
}

function setTextBindings(root, data) {
  root.querySelectorAll("[data-bind]").forEach((element) => {
    const value = getPath(data, element.dataset.bind);
    if (value !== undefined && value !== null) {
      element.textContent = value;
    }
  });
}

function setAssetBindings(root, data) {
  root.querySelectorAll("[data-bind-asset]").forEach((element) => {
    const value = getPath(data, element.dataset.bindAsset);
    if (value) {
      element.setAttribute("src", value);
    }
  });
}

function getGoalTag(event) {
  if (event.goalType === "penalty") return "(P)";
  if (event.goalType === "ownGoal") return "(AG)";
  return "";
}

function formatScorerName(event, isAway) {
  const player = event.player || "";
  const tag = getGoalTag(event);
  if (!tag) return player;
  return isAway ? `${tag} ${player}` : `${player} ${tag}`;
}

function formatScorerMinute(event) {
  if (Array.isArray(event.minutes) && event.minutes.length > 0) {
    return event.minutes.join(", ");
  }

  return event.minute || "";
}

function renderScorers(root, data) {
  const scorersBlock = root.querySelector(".scorers");
  const homeScorers = getPath(data, "events.homeScorers") || [];
  const awayScorers = getPath(data, "events.awayScorers") || [];

  if (scorersBlock) {
    scorersBlock.classList.toggle("is-empty", homeScorers.length === 0 && awayScorers.length === 0);
  }

  root.querySelectorAll("[data-bind-list]").forEach((list) => {
    const events = getPath(data, list.dataset.bindList) || [];
    const isAway = list.classList.contains("scorer-list-away");
    list.innerHTML = "";

    events.forEach((event) => {
      const row = document.createElement("div");
      row.className = "scorer-row";

      const minute = document.createElement("span");
      minute.className = "scorer-minute";
      minute.textContent = formatScorerMinute(event);

      const name = document.createElement("span");
      name.className = "scorer-name";
      name.textContent = formatScorerName(event, isAway);

      if (isAway) {
        row.append(minute, name);
      } else {
        row.append(name, minute);
      }

      list.append(row);
    });
  });
}

function fitTeamNames(root) {
  root.querySelectorAll(".team h2").forEach((heading) => {
    const length = heading.textContent.trim().length;
    heading.style.fontSize = length > 13 ? "24px" : length > 9 ? "27px" : "30px";
  });
}

function fitScorerNames(root) {
  root.querySelectorAll(".scorer-name").forEach((name) => {
    const length = name.textContent.trim().length;
    name.style.fontSize = length > 18 ? "13px" : length > 14 ? "15px" : "17px";
  });
}

function centerMatchInformation(root) {
  const subtitle = root.querySelector(".subtitle");
  const scoreboard = root.querySelector(".scoreboard");
  const scorers = root.querySelector(".scorers");
  const venueIcon = root.querySelector(".venue img");

  if (!subtitle || !scoreboard || !scorers || !venueIcon) return;

  const rootRect = root.getBoundingClientRect();
  const subtitleRect = subtitle.getBoundingClientRect();
  const scoreboardRect = scoreboard.getBoundingClientRect();
  const scorersRect = scorers.getBoundingClientRect();
  const venueIconRect = venueIcon.getBoundingClientRect();
  const scorerOffset = 368;
  const topBoundary = subtitleRect.bottom - rootRect.top;
  const bottomBoundary = venueIconRect.top - rootRect.top;
  const hasScorers = !scorers.classList.contains("is-empty");
  const contentHeight = hasScorers
    ? Math.max(scoreboardRect.height, scorerOffset + scorersRect.height)
    : scoreboardRect.height;
  const nextTop = topBoundary + (bottomBoundary - topBoundary - contentHeight) / 2;

  scoreboard.style.top = `${Math.round(nextTop)}px`;
  scorers.style.top = `${Math.round(nextTop + scorerOffset)}px`;
}

function renderMatchCard(data = matchData) {
  const root = document.getElementById("match-card");
  setTextBindings(root, data);
  setAssetBindings(root, data);
  renderScorers(root, data);
  fitTeamNames(root);
  fitScorerNames(root);
  requestAnimationFrame(() => centerMatchInformation(root));
}

async function loadExternalMatchData() {
  try {
    const response = await fetch("./data/current-match.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function init() {
  const externalData = await loadExternalMatchData();
  renderMatchCard(externalData || matchData);
}

init();

window.renderMatchCard = renderMatchCard;
window.matchData = matchData;
