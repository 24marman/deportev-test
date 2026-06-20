const topScorersData = {
  competition: {
    name: "COPA MUNDIAL",
    year: "2026",
    phase: "TABLA DE GOLEO",
    matchdayNumber: "2",
  },
  background: {
    image: "../figma_match_card/assets/backgrounds/generic.webp",
  },
  leaders: [
    {
      name: "MESSI",
      country: "ARGENTINA",
      goals: 4,
      flag: "../figma_match_card/assets/flags/ar.svg",
    },
    {
      name: "MBAPPÉ",
      country: "FRANCIA",
      goals: 3,
      flag: "../figma_match_card/assets/flags/fr.svg",
    },
    {
      name: "VINÍCIUS JR.",
      country: "BRASIL",
      goals: 3,
      flag: "../figma_match_card/assets/flags/br.svg",
    },
    {
      name: "MORATA",
      country: "ESPAÑA",
      goals: 2,
      flag: "../figma_match_card/assets/flags/es.svg",
    },
    {
      name: "PULISIC",
      country: "ESTADOS UNIDOS",
      goals: 2,
      flag: "../figma_match_card/assets/flags/us.svg",
    },
  ],
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

function createLeaderRow(leader, index) {
  const row = document.createElement("article");
  row.className = `leader-row${index === 0 ? " is-first" : ""}`;

  const green = document.createElement("div");
  green.className = "leader-green";

  const flagFrame = document.createElement("div");
  flagFrame.className = "flag-frame";

  const flag = document.createElement("img");
  flag.className = "leader-flag";
  flag.src = leader.flag || "../figma_match_card/assets/home-flag.svg";
  flag.alt = "";
  flagFrame.append(flag);

  const copy = document.createElement("div");
  copy.className = "leader-copy";

  const name = document.createElement("h2");
  name.className = "leader-name";
  name.textContent = leader.name || "JUGADOR";

  const country = document.createElement("p");
  country.className = "leader-country";
  country.textContent = leader.country || "";
  copy.append(name, country);

  const portraitWrap = document.createElement("div");
  portraitWrap.className = "leader-portrait-wrap";

  if (leader.portrait) {
    const portrait = document.createElement("img");
    portrait.className = "leader-portrait";
    portrait.src = leader.portrait;
    portrait.alt = "";
    portraitWrap.append(portrait);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "leader-portrait-fallback";
    portraitWrap.append(fallback);
  }

  const score = document.createElement("div");
  score.className = "leader-score";
  score.textContent = leader.goals ?? "0";

  row.append(green, flagFrame, copy, portraitWrap, score);
  return row;
}

function fitLeaderText(root) {
  root.querySelectorAll(".leader-name").forEach((element) => {
    const length = element.textContent.trim().length;
    element.style.fontSize = length > 13 ? "43px" : length > 10 ? "50px" : "60px";
  });

  root.querySelectorAll(".leader-country").forEach((element) => {
    const length = element.textContent.trim().length;
    element.style.fontSize = length > 18 ? "22px" : length > 14 ? "26px" : "30px";
  });
}

function renderTopScorersCard(data = topScorersData) {
  const root = document.getElementById("match-card");
  const leaderboard = root.querySelector("[data-leaderboard]");
  const leaders = Array.isArray(data.leaders) ? data.leaders.slice(0, 5) : [];

  setTextBindings(root, data);
  setAssetBindings(root, data);
  leaderboard.innerHTML = "";
  leaders.forEach((leader, index) => leaderboard.append(createLeaderRow(leader, index)));
  fitLeaderText(root);
}

async function loadExternalTopScorersData() {
  try {
    const response = await fetch("./data/current-top-scorers.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function init() {
  const externalData = await loadExternalTopScorersData();
  renderTopScorersCard(externalData || topScorersData);
}

init();

window.renderTopScorersCard = renderTopScorersCard;
window.renderMatchCard = renderTopScorersCard;
window.topScorersData = topScorersData;
