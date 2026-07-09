#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
// test-local.js
//
// Generates dashboard SVGs using mock data so you can preview locally
// without a GitHub token. Output goes to assets/stats/.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// Import the generator's internal rendering by re-using its logic inline.
// This avoids needing to refactor the main script purely for testing.

const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "assets", "stats");

const TOKENS = {
  dark: {
    accent: "#7C86F8",
    cardBg: "#161B22",
    cardBorder: "#30363D",
    innerBg: "#0D1117",
    heading: "#F0F6FC",
    body: "#9198A1",
    muted: "#6E7681",
  },
  light: {
    accent: "#4F46E5",
    cardBg: "#F6F8FA",
    cardBorder: "#D0D7DE",
    innerBg: "#FFFFFF",
    heading: "#1F2328",
    body: "#59636E",
    muted: "#818B98",
  },
};

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Mock data resembling real GitHub profile stats
const mockData = {
  stats: {
    stars: 12,
    commits: 247,
    prs: 5,
    repos: 8,
    issues: 3,
    followers: 14,
    totalContributions: 389,
  },
  languages: [
    { name: "JavaScript", bytes: 45200, percent: "38.2", color: "#F0DB4F" },
    { name: "Dart", bytes: 22100, percent: "18.7", color: "#00B4AB" },
    { name: "Verilog", bytes: 18400, percent: "15.5", color: "#B2B7F8" },
    { name: "HTML", bytes: 12600, percent: "10.6", color: "#E34C26" },
    { name: "C++", bytes: 11200, percent: "9.5", color: "#F34B7D" },
    { name: "Python", bytes: 8900, percent: "7.5", color: "#3572A5" },
  ],
  weeks: [],
};

// Contribution level distribution matching GitHub's quartile algorithm
const LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

// Generate mock contribution weeks (30 weeks of fake data with accurate structure)
for (let w = 0; w < 30; w++) {
  const days = [];
  for (let d = 0; d < 7; d++) {
    const count = Math.floor(Math.random() * 9);
    // Assign level based on count (simulating GitHub's quartile approach)
    let level;
    if (count === 0) level = "NONE";
    else if (count <= 2) level = "FIRST_QUARTILE";
    else if (count <= 4) level = "SECOND_QUARTILE";
    else if (count <= 6) level = "THIRD_QUARTILE";
    else level = "FOURTH_QUARTILE";

    days.push({
      contributionCount: count,
      contributionLevel: level,
      weekday: d, // 0=Sun ... 6=Sat
      date: `2025-${String(Math.floor(w / 4) + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
    });
  }
  mockData.weeks.push({ contributionDays: days });
}

function generateDashboard(data, mode) {
  const t = TOKENS[mode];
  const W = 880;
  const H = 300;
  const PAD = 32;

  // Uses GitHub's own contributionLevel for exact accuracy
  const contribLevels = {
    dark: {
      NONE:             "#21262D",
      FIRST_QUARTILE:   "#0E4429",
      SECOND_QUARTILE:  "#006D32",
      THIRD_QUARTILE:   "#26A641",
      FOURTH_QUARTILE:  "#39D353",
    },
    light: {
      NONE:             "#EBEDF0",
      FIRST_QUARTILE:   "#9BE9A8",
      SECOND_QUARTILE:  "#40C463",
      THIRD_QUARTILE:   "#30A14E",
      FOURTH_QUARTILE:  "#216E39",
    },
  };
  function contribColor(level) {
    return contribLevels[mode][level] || contribLevels[mode].NONE;
  }

  const statItems = [
    { label: "STARS", value: formatNumber(data.stats.stars) },
    { label: "COMMITS", value: formatNumber(data.stats.commits) },
    { label: "PRs", value: formatNumber(data.stats.prs) },
    { label: "REPOS", value: formatNumber(data.stats.repos) },
    { label: "ISSUES", value: formatNumber(data.stats.issues) },
    { label: "FOLLOWERS", value: formatNumber(data.stats.followers) },
  ];

  let overviewSvg = "";
  const overviewX = PAD;
  const overviewY = 80;
  const colW = 100;
  const rowH = 48;

  for (let i = 0; i < statItems.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = overviewX + col * colW;
    const y = overviewY + row * rowH;
    overviewSvg += `
    <text class="stat-val" x="${x}" y="${y}">${statItems[i].value}</text>
    <text class="stat-lbl" x="${x}" y="${y + 16}">${statItems[i].label}</text>`;
  }

  const langX = 340;
  const langY = 78;
  const barW = 180;
  const barH = 8;
  const langGap = 28;
  let langSvg = "";

  for (let i = 0; i < data.languages.length; i++) {
    const lang = data.languages[i];
    const y = langY + i * langGap;
    const fillW = Math.max(2, (parseFloat(lang.percent) / 100) * barW);
    langSvg += `
    <text class="lang-name" x="${langX}" y="${y}">${escapeXml(lang.name)}</text>
    <text class="lang-pct" x="${langX + barW + 8}" y="${y}">${lang.percent}%</text>
    <rect x="${langX}" y="${y + 4}" width="${barW}" height="${barH}" rx="4" fill="${t.innerBg}" stroke="${t.cardBorder}" stroke-width="0.5"/>
    <rect x="${langX}" y="${y + 4}" width="${fillW}" height="${barH}" rx="4" fill="${lang.color}" opacity="0.85"/>`;
  }

  const graphX = 576;
  const graphY = 72;
  const cellSize = 7;
  const cellGap = 2;
  const weeksToShow = Math.min(data.weeks.length, 30);
  const displayWeeks = data.weeks.slice(-weeksToShow);
  let contribSvg = "";

  for (let w = 0; w < displayWeeks.length; w++) {
    const week = displayWeeks[w];
    for (let d = 0; d < week.contributionDays.length; d++) {
      const day = week.contributionDays[d];
      const x = graphX + w * (cellSize + cellGap);
      const row = day.weekday != null ? day.weekday : d;
      const y = graphY + row * (cellSize + cellGap);
      contribSvg += `
    <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${contribColor(day.contributionLevel || (day.contributionCount === 0 ? 'NONE' : 'SECOND_QUARTILE'))}"/>`;
    }
  }

  const contribTotal = data.stats.totalContributions;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub activity dashboard — ${data.stats.commits} commits, ${data.stats.repos} repositories, top language ${data.languages[0]?.name || "N/A"}">
  <style>
    .kick { font: 600 11px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace; letter-spacing: 2px; fill: ${t.muted}; }
    .num  { fill: ${t.accent}; }
    .section-title { font: 600 12px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace; letter-spacing: 1.5px; fill: ${t.muted}; }
    .stat-val { font: 700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; letter-spacing: -0.5px; fill: ${t.heading}; }
    .stat-lbl { font: 500 9px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace; letter-spacing: 1.5px; fill: ${t.muted}; }
    .lang-name { font: 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; fill: ${t.body}; }
    .lang-pct { font: 500 10px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace; fill: ${t.muted}; }
    .contrib-label { font: 500 9px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace; letter-spacing: 1px; fill: ${t.muted}; }
    .contrib-total { font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; fill: ${t.heading}; }
    .contrib-sub { font: 400 11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; fill: ${t.body}; }
    .pulse { animation: pulse 2.8s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .pulse { animation: none; opacity: 1; }
    }
  </style>

  <!-- Card shell -->
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.cardBg}" stroke="${t.cardBorder}"/>

  <!-- Kicker -->
  <circle class="pulse" cx="${PAD + 3}" cy="26" r="3" fill="${t.accent}"/>
  <text class="kick" x="${PAD + 16}" y="30"><tspan class="num">◆</tspan><tspan dx="8">GITHUB METRICS</tspan></text>

  <!-- Vertical separators -->
  <line x1="326" y1="46" x2="326" y2="${H - 24}" stroke="${t.cardBorder}" stroke-width="1"/>
  <line x1="562" y1="46" x2="562" y2="${H - 24}" stroke="${t.cardBorder}" stroke-width="1"/>

  <!-- Section: Overview -->
  <text class="section-title" x="${PAD}" y="48">OVERVIEW</text>
  ${overviewSvg}

  <!-- Section: Languages -->
  <text class="section-title" x="340" y="48">LANGUAGES</text>
  ${langSvg}

  <!-- Section: Contributions -->
  <text class="section-title" x="${graphX}" y="48">CONTRIBUTIONS</text>
  ${contribSvg}

  <!-- Contribution total -->
  <text class="contrib-total" x="${graphX}" y="${H - 30}">${formatNumber(contribTotal)}</text>
  <text class="contrib-sub" x="${graphX + (String(formatNumber(contribTotal)).length * 9) + 4}" y="${H - 30}">this year</text>
</svg>
`;
}

// Generate
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const mode of ["dark", "light"]) {
  const svg = generateDashboard(mockData, mode);
  const filepath = path.join(OUTPUT_DIR, `dashboard-${mode}.svg`);
  fs.writeFileSync(filepath, svg, "utf-8");
  console.log(`✓ dashboard-${mode}.svg (${svg.length} bytes)`);
}

console.log(`\nOutput: ${OUTPUT_DIR}`);
console.log("Open the SVGs in a browser to preview.");
