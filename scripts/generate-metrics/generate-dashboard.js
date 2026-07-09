#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
// generate-dashboard.js
//
// Self-hosted GitHub metrics dashboard generator.
// Produces dark + light SVG variants that match the profile README design
// system exactly — same colors, typography, spacing, border radius, and
// animation patterns.
//
// Usage:
//   GITHUB_TOKEN=ghp_xxx GITHUB_USER=sahiljo14 node generate-dashboard.js
//
// Environment:
//   GITHUB_TOKEN   — GitHub personal access token or Actions token
//   GITHUB_USER    — GitHub username (default: sahiljo14)
//   OUTPUT_DIR     — Output directory (default: ../../assets/stats)
// ─────────────────────────────────────────────────────────────────────────────

const https = require("https");
const fs = require("fs");
const path = require("path");

// ─── Configuration ───────────────────────────────────────────────────────────

const GITHUB_USER = process.env.GITHUB_USER || "sahiljo14";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT_DIR =
  process.env.OUTPUT_DIR ||
  path.resolve(__dirname, "..", "..", "assets", "stats");

// ─── Design Tokens (extracted from existing SVGs) ────────────────────────────

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

// Language colors — curated palette that harmonizes with the accent tones
const LANG_COLORS = {
  JavaScript: "#F0DB4F",
  TypeScript: "#3178C6",
  Python: "#3572A5",
  Java: "#B07219",
  Dart: "#00B4AB",
  "C++": "#F34B7D",
  C: "#555555",
  HTML: "#E34C26",
  CSS: "#563D7C",
  Verilog: "#B2B7F8",
  "SystemVerilog": "#DAE1C2",
  Shell: "#89E051",
  Makefile: "#427819",
  Ruby: "#701516",
  Go: "#00ADD8",
  Rust: "#DEA584",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  MATLAB: "#E16737",
  "Jupyter Notebook": "#DA5B0B",
  Vue: "#41B883",
  SCSS: "#C6538C",
  "Embedded C": "#555555",
};

// Fallback color for unknown languages
const DEFAULT_LANG_COLOR = "#8B949E";

// ─── GitHub GraphQL API ──────────────────────────────────────────────────────

function graphql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, variables });
    const options = {
      hostname: "api.github.com",
      path: "/graphql",
      method: "POST",
      headers: {
        Authorization: `bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "github-profile-metrics/1.0",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data.errors) {
            reject(new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`));
          } else {
            resolve(data.data);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchGitHubData() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: STARGAZERS, direction: DESC}) {
          totalCount
          nodes {
            stargazerCount
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node { name }
              }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalRepositoryContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                weekday
                date
              }
            }
          }
        }
        followers { totalCount }
      }
    }
  `;

  const data = await graphql(query, { login: GITHUB_USER });
  const user = data.user;
  const contrib = user.contributionsCollection;
  const repos = user.repositories;

  // Aggregate stars
  const totalStars = repos.nodes.reduce(
    (sum, r) => sum + r.stargazerCount,
    0
  );

  // Aggregate languages by bytes
  const langMap = {};
  for (const repo of repos.nodes) {
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      langMap[name] = (langMap[name] || 0) + edge.size;
    }
  }

  // Sort and take top 6
  const totalBytes = Object.values(langMap).reduce((a, b) => a + b, 0);
  const languages = Object.entries(langMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: totalBytes > 0 ? ((bytes / totalBytes) * 100).toFixed(1) : 0,
      color: LANG_COLORS[name] || DEFAULT_LANG_COLOR,
    }));

  // Contribution calendar — full year
  const weeks = contrib.contributionCalendar.weeks;

  return {
    stats: {
      stars: totalStars,
      commits: contrib.totalCommitContributions,
      prs: contrib.totalPullRequestContributions,
      issues: contrib.totalIssueContributions,
      repos: repos.totalCount,
      followers: user.followers.totalCount,
      totalContributions: contrib.contributionCalendar.totalContributions,
    },
    languages,
    weeks,
  };
}

// ─── SVG Rendering ───────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function generateDashboard(data, mode) {
  const t = TOKENS[mode];

  // ── Dimensions ──
  const W = 880;
  const H = 300;
  const PAD = 32;

  // ── Contribution graph intensity levels ──
  // Uses GitHub's own contributionLevel enum for exact accuracy.
  // These match GitHub's default green palette at each quartile.
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

  // ── Overview stats grid ──
  const statItems = [
    { label: "STARS", value: formatNumber(data.stats.stars), icon: "★" },
    { label: "COMMITS", value: formatNumber(data.stats.commits), icon: "⬡" },
    { label: "PRs", value: formatNumber(data.stats.prs), icon: "⑂" },
    { label: "REPOS", value: formatNumber(data.stats.repos), icon: "▣" },
    { label: "ISSUES", value: formatNumber(data.stats.issues), icon: "◉" },
    { label: "FOLLOWERS", value: formatNumber(data.stats.followers), icon: "♟" },
  ];

  // ── Build overview section ──
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

  // ── Build languages section ──
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

  // ── Build contribution graph ──
  // Uses weekday field for accurate row positioning (handles partial weeks
  // at year boundaries) and contributionLevel for GitHub-exact intensity.
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
      // Use the actual weekday (0=Sun … 6=Sat) for correct row placement
      const row = day.weekday != null ? day.weekday : d;
      const y = graphY + row * (cellSize + cellGap);
      contribSvg += `
    <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${contribColor(day.contributionLevel || (day.contributionCount === 0 ? 'NONE' : 'SECOND_QUARTILE'))}"/>`;
    }
  }

  // Total contributions label
  const contribTotal = data.stats.totalContributions;

  // ── Compose full SVG ──
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub activity dashboard — ${data.stats.commits} commits, ${data.stats.repos} repositories, top language ${data.languages[0]?.name || "N/A"}">
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
  <text class="section-title" x="${langX}" y="48">LANGUAGES</text>
  ${langSvg}

  <!-- Section: Contributions -->
  <text class="section-title" x="${graphX}" y="48">CONTRIBUTIONS</text>
  ${contribSvg}

  <!-- Contribution total -->
  <text class="contrib-total" x="${graphX}" y="${H - 30}">${formatNumber(contribTotal)}</text>
  <text class="contrib-sub" x="${graphX + (String(formatNumber(contribTotal)).length * 9) + 4}" y="${H - 30}">this year</text>
</svg>
`;

  return svg;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validateSvg(content, filename) {
  if (!content || content.length < 100) {
    throw new Error(`Generated SVG "${filename}" is too small (${content?.length || 0} bytes) — likely corrupted.`);
  }
  if (!content.includes("<svg") || !content.includes("</svg>")) {
    throw new Error(`Generated SVG "${filename}" is missing <svg> tags — invalid.`);
  }
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("┌─ GitHub Metrics Dashboard Generator");
  console.log("│");

  // Validate token
  if (!GITHUB_TOKEN) {
    console.error("│  ✗ GITHUB_TOKEN is required");
    console.error("│    Set it via environment variable or GitHub Actions secret.");
    console.error("└─ Aborted.");
    process.exit(1);
  }

  console.log(`│  User:   ${GITHUB_USER}`);
  console.log(`│  Output: ${OUTPUT_DIR}`);
  console.log("│");

  // Fetch data
  console.log("│  Fetching GitHub data...");
  let data;
  try {
    data = await fetchGitHubData();
  } catch (err) {
    console.error(`│  ✗ Failed to fetch data: ${err.message}`);
    console.error("└─ Aborted.");
    process.exit(1);
  }

  console.log(`│  ✓ ${data.stats.commits} commits, ${data.stats.repos} repos, ${data.languages.length} languages`);
  console.log("│");

  // Ensure output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate SVGs
  const variants = ["dark", "light"];
  for (const mode of variants) {
    console.log(`│  Generating dashboard-${mode}.svg...`);
    const svg = generateDashboard(data, mode);
    const filename = `dashboard-${mode}.svg`;

    // Validate
    validateSvg(svg, filename);

    // Write
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, svg, "utf-8");
    console.log(`│  ✓ ${filename} (${svg.length} bytes)`);
  }

  console.log("│");
  console.log("└─ Done.");
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
