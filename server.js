const http = require("http");
// Load .env file if present
try {
  const envPath = require("path").join(__dirname, ".env");
  require("fs").readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { randomUUID } = require("crypto");
const {
  buildCurriculum,
  generateQuestions,
  generateScenario,
  getAllPaths,
  getPath
} = require("./data/content");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const indianLanguages = [
  "English",
  "Assamese",
  "Bengali",
  "Bodo",
  "Dogri",
  "Gujarati",
  "Hindi",
  "Kannada",
  "Kashmiri",
  "Konkani",
  "Maithili",
  "Malayalam",
  "Manipuri",
  "Marathi",
  "Nepali",
  "Odia",
  "Punjabi",
  "Sanskrit",
  "Santali",
  "Sindhi",
  "Tamil",
  "Telugu",
  "Urdu",
  "Indian Sign Language"
];

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function yesterdayKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}


/* ── DATABASE ────────────────────────────────────────────────────────────── */
// ── POSTGRESQL POOL ──────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper: run a query and return rows
async function q(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}
async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// ── SCHEMA INIT ──────────────────────────────────────────────────────────────
async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at TEXT,
      xp INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      avatar_data_url TEXT,
      role TEXT,
      preferred_language TEXT,
      active_path_id TEXT,
      onboarded INTEGER DEFAULT 0,
      last_activity_date TEXT
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  // Clean expired sessions
  await q("DELETE FROM sessions WHERE expires_at < $1", [new Date().toISOString()]);
}

// ── SEED DEMO USERS ──────────────────────────────────────────────────────────
async function seedDemoUsers() {
  const row = await q1("SELECT COUNT(1) AS count FROM users");
  if (row && parseInt(row.count) > 0) return;

  const demoNames = [
    "Aarav S.", "Isha K.", "Rohan P.", "Meera J.", "Vihaan M.",
    "Ananya G.", "Dev P.", "Sanya R.", "Karan T.", "Priya M.",
    "Laksh B.", "Nisha D.", "Aditya L.", "Riya K.", "Kabir N.",
    "Sneha R.", "Arjun S.", "Zoya F.", "Rohit V.", "Tara A."
  ];

  const now = new Date().toISOString();
  for (let idx = 0; idx < demoNames.length; idx++) {
    const name = demoNames[idx];
    const userId = `demo-${idx + 1}`;
    const email  = `demo${idx + 1}@netra.local`;
    const xp     = 200 + Math.floor(Math.random() * 2600);
    const streak = Math.floor(Math.random() * 14);
    const state  = createInitialState();
    state.profile.name    = name;
    state.profile.xp      = xp;
    state.profile.streak  = streak;
    state.profile.onboarded = true;

    await q(`
      INSERT INTO users (id, name, email, password_hash, created_at, xp, streak, role, preferred_language, active_path_id, onboarded)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'Student','English','grades-6-8',1)
      ON CONFLICT (id) DO NOTHING
    `, [userId, name, email, simpleHash("demo123"), now, xp, streak]);

    await q(`
      INSERT INTO user_state (user_id, state_json, updated_at)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId, JSON.stringify(state), now]);
  }
}

// ── DB-BACKED SESSIONS ───────────────────────────────────────────────────────
async function createDbSession(userId) {
  const token   = randomUUID() + "-" + Date.now().toString(36);
  const now     = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await q(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (token) DO UPDATE SET expires_at=$4",
    [token, userId, now, expires]
  );
  return token;
}

async function lookupDbSession(token) {
  if (!token) return null;
  const row = await q1("SELECT user_id, expires_at FROM sessions WHERE token=$1", [token]);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await q("DELETE FROM sessions WHERE token=$1", [token]);
    return null;
  }
  return row.user_id;
}

async function deleteDbSession(token) {
  if (token) await q("DELETE FROM sessions WHERE token=$1", [token]);
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/netra_session=([^;]+)/);
  return match ? match[1] : null;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `netra_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "netra_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}
async function getActiveUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  return lookupDbSession(token);
}

// ── USER QUERIES ─────────────────────────────────────────────────────────────
async function getUserByEmail(email) {
  return q1("SELECT * FROM users WHERE email=$1", [email]);
}
async function getUserById(userId) {
  return q1("SELECT * FROM users WHERE id=$1", [userId]);
}

async function upsertUserFromProfile(userId, profile) {
  const existing = await getUserById(userId);
  await q(`
    INSERT INTO users (id, name, email, password_hash, created_at, xp, streak, avatar_data_url, role, preferred_language, active_path_id, onboarded, last_activity_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET
      name=excluded.name, xp=excluded.xp, streak=excluded.streak,
      avatar_data_url=excluded.avatar_data_url, role=excluded.role,
      preferred_language=excluded.preferred_language,
      active_path_id=excluded.active_path_id,
      onboarded=excluded.onboarded,
      last_activity_date=excluded.last_activity_date
  `, [
    userId,
    profile.name || existing?.name || "",
    existing?.email || null,
    existing?.password_hash || null,
    existing?.created_at || new Date().toISOString(),
    profile.xp || 0,
    profile.streak || 0,
    profile.avatarDataUrl || null,
    profile.role || "Student",
    profile.preferredLanguage || "English",
    profile.activePathId || "grades-6-8",
    profile.onboarded ? 1 : 0,
    profile.lastActivityDate || null
  ]);
}

async function registerUser(name, email, password) {
  const emailKey = email.toLowerCase().trim();
  const existing = await getUserByEmail(emailKey);
  if (existing) return { error: "An account with this email already exists." };
  const userId = "user-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const now    = new Date().toISOString();
  await q(`
    INSERT INTO users (id, name, email, password_hash, created_at, xp, streak, role, preferred_language, active_path_id, onboarded)
    VALUES ($1,$2,$3,$4,$5,0,0,'Student','English','grades-6-8',0)
  `, [userId, name, emailKey, simpleHash(password), now]);
  const initial = createInitialState();
  initial.profile.name = name;
  await writeState(userId, initial);
  return { userId, name, email: emailKey };
}

async function loginUser(email, password) {
  const emailKey = email.toLowerCase().trim();
  const account  = await getUserByEmail(emailKey);
  if (!account) return { error: "No account found with this email." };
  if (account.password_hash !== simpleHash(password)) return { error: "Incorrect password." };
  return { userId: account.id, name: account.name, email: emailKey };
}

// ── STATE READ / WRITE ───────────────────────────────────────────────────────
async function readState(userId) {
  if (!userId) return migrateState(createInitialState());
  const userRow = await getUserById(userId);
  const row = await q1("SELECT state_json FROM user_state WHERE user_id=$1", [userId]);
  if (!row?.state_json) {
    const initial = createInitialState();
    initial.profile.id = userId;
    applyUserProfile(initial, userRow);
    await writeState(userId, initial);
    return migrateState(initial);
  }
  const state = migrateState(JSON.parse(row.state_json));
  applyUserProfile(state, userRow);
  return state;
}

async function writeState(userId, state) {
  if (!userId) return;
  const now = new Date().toISOString();
  await q(`
    INSERT INTO user_state (user_id, state_json, updated_at)
    VALUES ($1,$2,$3)
    ON CONFLICT (user_id) DO UPDATE SET state_json=$2, updated_at=$3
  `, [userId, JSON.stringify(state), now]);
  await upsertUserFromProfile(userId, state.profile || {});
}

// ── LEADERBOARD ──────────────────────────────────────────────────────────────
async function getLeaderboard(res, url, userId) {
  const rows   = await q("SELECT id, name, xp, streak FROM users ORDER BY xp DESC, streak DESC, created_at ASC");
  const ranked = rows.map((row, i) => ({
    id: row.id,
    name: row.name || "Learner",
    xp: parseInt(row.xp) || 0,
    streak: parseInt(row.streak) || 0,
    badge: "⭐",
    isMe: row.id === userId,
    rank: i + 1
  }));
  sendJson(res, 200, { leaderboard: ranked.slice(0, 50) });
}

// ── UTILS ────────────────────────────────────────────────────────────────────
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Boot DB on startup
(async () => {
  try {
    await initDb();
    await seedDemoUsers();
    console.log("✅ Database ready");
  } catch (err) {
    console.error("❌ DB init failed:", err.message);
  }
})();

function createInitialState() {
  return {
    profile: {
      id: "demo-family",
      name: "",
      role: "Student",
      activePathId: "grades-6-8",
      preferredLanguage: "English",
      avatarDataUrl: null,
      avatarColor: "#18a999",
      onboarded: false,
      xp: 0,
      streak: 0,
      lastActivityDate: null,
      createdAt: new Date().toISOString()
    },
    progress: {},
    attempts: [],
    certificates: []
  };
}

function applyUserProfile(state, userRow) {
  if (!userRow) return;
  state.profile.name               = userRow.name               || state.profile.name;
  state.profile.role               = userRow.role               || state.profile.role;
  state.profile.preferredLanguage  = userRow.preferred_language  || state.profile.preferredLanguage;
  state.profile.activePathId       = userRow.active_path_id      || state.profile.activePathId;
  state.profile.xp                 = userRow.xp                  || state.profile.xp;
  state.profile.streak             = userRow.streak              || state.profile.streak;
  state.profile.avatarDataUrl      = userRow.avatar_data_url     || state.profile.avatarDataUrl;
  state.profile.lastActivityDate   = userRow.last_activity_date  || state.profile.lastActivityDate;
  // PG returns INTEGER — coerce to boolean explicitly
  state.profile.onboarded = !!userRow.onboarded || state.profile.onboarded;
}

function migrateState(state) {
  const initial = createInitialState();
  const profile = {
    ...initial.profile,
    ...(state.profile || {})
  };

  profile.name = typeof profile.name === "string" ? profile.name : "";
  if (profile.onboarded !== true && profile.name === "Aarav") {
    profile.name = "";
  }
  profile.role = typeof profile.role === "string" ? profile.role : "Student";
  profile.activePathId = getPath(profile.activePathId).id;
  profile.preferredLanguage = indianLanguages.includes(profile.preferredLanguage)
    ? profile.preferredLanguage
    : "English";
  profile.avatarDataUrl = typeof profile.avatarDataUrl === "string" ? profile.avatarDataUrl : null;
  profile.avatarColor = typeof profile.avatarColor === "string" ? profile.avatarColor : "#18a999";
  profile.avatarConfig = null;
  profile.onboarded = profile.onboarded === true;

  return {
    profile,
    progress: state.progress || {},
    attempts: Array.isArray(state.attempts) ? state.attempts : [],
    certificates: Array.isArray(state.certificates) ? state.certificates : []
  };
}


function ensurePathProgress(state, pathId) {
  const curriculum = buildCurriculum(pathId);
  if (!state.progress[pathId]) {
    state.progress[pathId] = {
      completedLevels: [],
      completedSections: [],
      completedSimulations: [],
      lessonAccuracy: {},
      sectionAccuracy: {},
      currentLessonId: curriculum[0].id,
      currentLevelId: curriculum[0].levels[0].id,
      currentSectionId: curriculum[0].levels[0].sections[0].id
    };
  }

  const pathProgress = state.progress[pathId];
  pathProgress.completedLevels = Array.isArray(pathProgress.completedLevels) ? pathProgress.completedLevels : [];
  pathProgress.completedSections = Array.isArray(pathProgress.completedSections) ? pathProgress.completedSections : [];
  pathProgress.completedSimulations = Array.isArray(pathProgress.completedSimulations) ? pathProgress.completedSimulations : [];
  pathProgress.lessonAccuracy = pathProgress.lessonAccuracy || {};
  pathProgress.sectionAccuracy = pathProgress.sectionAccuracy || {};
  pathProgress.currentLessonId = pathProgress.currentLessonId || curriculum[0].id;
  pathProgress.currentLevelId = pathProgress.currentLevelId || curriculum[0].levels[0].id;
  pathProgress.currentSectionId = pathProgress.currentSectionId || curriculum[0].levels[0].sections[0].id;

  if (pathProgress.completedSections.length === 0 && pathProgress.completedLevels.length > 0) {
    curriculum.forEach((lesson) => {
      lesson.levels.forEach((level) => {
        const legacyKey = completeKey(lesson.id, level.id);
        if (pathProgress.completedLevels.includes(legacyKey)) {
          level.sections.forEach((section) => {
            const key = completeKey(lesson.id, level.id, section.id);
            if (!pathProgress.completedSections.includes(key)) {
              pathProgress.completedSections.push(key);
            }
          });
        }
      });
    });
  }

  return state.progress[pathId];
}

function completeKey(lessonId, levelId, sectionId = null) {
  return sectionId ? `${lessonId}:${levelId}:${sectionId}` : `${lessonId}:${levelId}`;
}

function isSectionComplete(pathProgress, lessonId, levelId, sectionId) {
  return pathProgress.completedSections.includes(completeKey(lessonId, levelId, sectionId));
}

function isLevelComplete(pathProgress, lesson, level) {
  return level.sections.every((section) => isSectionComplete(pathProgress, lesson.id, level.id, section.id));
}

function isSectionUnlocked(pathProgress, lessonId, levelId, sectionId, pathId) {
  const curriculum = buildCurriculum(pathId);
  const lessonIndex = curriculum.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex === -1) return false;
  const levelIndex = curriculum[lessonIndex].levels.findIndex((level) => level.id === levelId);
  if (levelIndex === -1) return false;
  const sectionIndex = curriculum[lessonIndex].levels[levelIndex].sections.findIndex((section) => section.id === sectionId);
  if (sectionIndex === -1) return false;
  if (lessonIndex === 0 && levelIndex === 0 && sectionIndex === 0) return true;

  if (sectionIndex > 0) {
    const previousSection = curriculum[lessonIndex].levels[levelIndex].sections[sectionIndex - 1];
    return isSectionComplete(pathProgress, lessonId, levelId, previousSection.id);
  }

  if (levelIndex > 0) {
    const previousLevel = curriculum[lessonIndex].levels[levelIndex - 1];
    const finalSection = previousLevel.sections[previousLevel.sections.length - 1];
    return isSectionComplete(pathProgress, lessonId, previousLevel.id, finalSection.id);
  }

  const previousLesson = curriculum[lessonIndex - 1];
  const finalLevel = previousLesson.levels[previousLesson.levels.length - 1];
  const finalSection = finalLevel.sections[finalLevel.sections.length - 1];
  return isSectionComplete(pathProgress, previousLesson.id, finalLevel.id, finalSection.id);
}

function getNextNode(pathId, lessonId, levelId, sectionId) {
  const curriculum = buildCurriculum(pathId);
  const lessonIndex = curriculum.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex === -1) return null;
  const levelIndex = curriculum[lessonIndex].levels.findIndex((level) => level.id === levelId);
  if (levelIndex === -1) return null;
  const sectionIndex = curriculum[lessonIndex].levels[levelIndex].sections.findIndex((section) => section.id === sectionId);
  if (sectionIndex === -1) return null;

  const nextSection = curriculum[lessonIndex].levels[levelIndex].sections[sectionIndex + 1];
  if (nextSection) {
    return { lessonId, levelId, sectionId: nextSection.id };
  }

  const nextLevel = curriculum[lessonIndex].levels[levelIndex + 1];
  if (nextLevel) {
    return { lessonId, levelId: nextLevel.id, sectionId: nextLevel.sections[0].id };
  }

  const nextLesson = curriculum[lessonIndex + 1];
  if (nextLesson) {
    return {
      lessonId: nextLesson.id,
      levelId: nextLesson.levels[0].id,
      sectionId: nextLesson.levels[0].sections[0].id
    };
  }

  return null;
}

function applyStreak(profile) {
  const today = todayKey();
  if (profile.lastActivityDate === today) {
    return;
  }

  // Rule: if last activity was NOT yesterday, streak is broken -> reset to 0.
  // Completing a section today will start a fresh streak of 1.
  if (profile.lastActivityDate === yesterdayKey(today)) {
    profile.streak = profile.streak + 1;
  } else {
    // Missed one or more days with no section completed -> start fresh at 1 for today
    profile.streak = 1;
  }
  profile.lastActivityDate = today;
}

// Called whenever a profile is bootstrapped: if the user missed yesterday without
// completing any section, their streak drops to 0. It recovers to 1 the moment
// they complete a section today (applyStreak handles that).
function checkStreakDecay(profile) {
  const today = todayKey();
  if (!profile.lastActivityDate) return;
  if (profile.lastActivityDate === today) return;            // active today, no decay
  if (profile.lastActivityDate === yesterdayKey(today)) return; // still have all of today
  // Missed at least one day without completing a section -> strike resets to zero
  profile.streak = 0;
}

function summarizePath(state, pathId) {
  const pathConfig = getPath(pathId);
  const pathProgress = ensurePathProgress(state, pathId);
  const curriculum = buildCurriculum(pathId);
  const totalLevels = pathConfig.lessons * pathConfig.levelsPerLesson;
  const totalSections = totalLevels * pathConfig.sectionsPerLevel;
  const completedSections = pathProgress.completedSections.length;
  const completedLevels = curriculum.reduce((count, lesson) => {
    return count + lesson.levels.filter((level) => isLevelComplete(pathProgress, lesson, level)).length;
  }, 0);
  const scenarioTarget = pathConfig.lessons * pathConfig.scenariosPerLesson;
  const completedSimulations = pathProgress.completedSimulations.length;
  const isComplete = completedSections >= totalSections;

  return {
    totalLevels,
    completedLevels,
    totalSections,
    completedSections,
    levelPercent: Math.round((completedSections / totalSections) * 100),
    sectionPercent: Math.round((completedSections / totalSections) * 100),
    scenarioTarget,
    completedSimulations,
    simulationPercent: Math.round((completedSimulations / scenarioTarget) * 100),
    isComplete
  };
}

function decorateCurriculum(state, pathId) {
  const curriculum = buildCurriculum(pathId);
  const pathProgress = ensurePathProgress(state, pathId);

  return curriculum.map((lesson) => ({
    ...lesson,
    levels: lesson.levels.map((level) => {
      const sections = level.sections.map((section) => {
        const key = completeKey(lesson.id, level.id, section.id);
        return {
          ...section,
          completed: pathProgress.completedSections.includes(key),
          unlocked: isSectionUnlocked(pathProgress, lesson.id, level.id, section.id, pathId),
          accuracy: pathProgress.sectionAccuracy[key] || null
        };
      });
      const completedSections = sections.filter((section) => section.completed).length;
      return {
        ...level,
        sections,
        completed: completedSections === sections.length,
        unlocked: sections.some((section) => section.unlocked),
        completedSections,
        totalSections: sections.length,
        accuracy: null
      };
    }),
    simulationsCompleted: pathProgress.completedSimulations.filter((simulationId) =>
      simulationId.startsWith(`${lesson.id}-scenario-`)
    ).length
  }));
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    activePathId: profile.activePathId,
    preferredLanguage: profile.preferredLanguage,
    avatarDataUrl: profile.avatarDataUrl,
    avatarColor: profile.avatarColor,
    avatarConfig: profile.avatarConfig || null,
    onboarded: profile.onboarded,
    xp: profile.xp,
    streak: profile.streak,
    lastActivityDate: profile.lastActivityDate
  };
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function sendStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      sendError(res, 404, "Not found");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "public, max-age=120"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    if (!pathname.startsWith("/api/")) {
      await sendStatic(req, res, "/index.html");
      return;
    }
    sendError(res, 404, "Not found");
  }
}

async function bootstrap(res, userId) {
  const state = await readState(userId);
  checkStreakDecay(state.profile); // zero streak if missed yesterday with no section
  const pathId = state.profile.activePathId;
  ensurePathProgress(state, pathId);
  const payload = {
    profile: publicProfile(state.profile),
    paths: getAllPaths(),
    languages: indianLanguages,
    activePath: getPath(pathId),
    curriculum: decorateCurriculum(state, pathId),
    progress: state.progress[pathId],
    stats: summarizePath(state, pathId),
    certificate: state.certificates.find((certificate) => certificate.pathId === pathId) || null
  };
  await writeState(userId, state);
  sendJson(res, 200, payload);
}

async function saveProfile(res, body, userId) {
  const state = await readState(userId);
  const path = getPath(body.activePathId || state.profile.activePathId);
  const name = String(body.name || "").trim().slice(0, 64);
  const role = String(body.role || "Student").trim().slice(0, 32);
  const preferredLanguage = indianLanguages.includes(body.preferredLanguage)
    ? body.preferredLanguage
    : "English";
  const avatarColor = /^#[0-9a-fA-F]{6}$/.test(body.avatarColor || "")
    ? body.avatarColor
    : state.profile.avatarColor;
  const avatarDataUrl =
    typeof body.avatarDataUrl === "string" && body.avatarDataUrl.startsWith("data:image/")
      ? body.avatarDataUrl.slice(0, 600_000)
      : body.avatarDataUrl === null
        ? null
        : state.profile.avatarDataUrl;

  if (!name) {
    sendError(res, 400, "Name is required");
    return;
  }

  state.profile = {
    ...state.profile,
    name,
    role,
    preferredLanguage,
    avatarColor,
    avatarDataUrl,
    avatarConfig: null,
    activePathId: path.id,
    onboarded: true,
    profileUpdatedAt: new Date().toISOString()
  };
  ensurePathProgress(state, path.id);
  await writeState(userId, state);
  await bootstrap(res, userId);
}

async function selectPath(res, body, userId) {
  const path = getPath(body.pathId);
  if (!path || path.id !== body.pathId) {
    sendError(res, 400, "Unknown path");
    return;
  }

  const state = await readState(userId);
  state.profile.activePathId = path.id;
  ensurePathProgress(state, path.id);
  await writeState(userId, state);
  await bootstrap(res, userId);
}

async function startSession(res, url, userId) {
  const state = await readState(userId);
  const pathId = url.searchParams.get("pathId") || state.profile.activePathId;
  const lessonId = url.searchParams.get("lessonId") || "lesson-1";
  const levelId = url.searchParams.get("levelId") || "level-1";
  const sectionId = url.searchParams.get("sectionId") || "section-1";
  const pathProgress = ensurePathProgress(state, pathId);

  if (!isSectionUnlocked(pathProgress, lessonId, levelId, sectionId, pathId)) {
    sendError(res, 423, "This section is locked");
    return;
  }

  const previousAccuracy = pathProgress.sectionAccuracy[completeKey(lessonId, levelId, sectionId)] || 0.75;
  const questions = generateQuestions({ pathId, lessonId, levelId, sectionId, accuracy: previousAccuracy });
  const session = {
    id: randomUUID(),
    pathId,
    lessonId,
    levelId,
    sectionId,
    questionCount: questions.length,
    questions: questions.map((question) => ({ ...question }))
  };

  state.attempts.push({
    id: session.id,
    type: "quiz-start",
    pathId,
    lessonId,
    levelId,
    sectionId,
    questionCount: questions.length,
    answerKey: questions.map((question) => question.answer),
    questions,
    createdAt: new Date().toISOString()
  });
  await writeState(userId, state);
  sendJson(res, 200, session);
}

async function completeSession(res, body, userId) {
  const state = await readState(userId);
  const { sessionId, answers = [] } = body;
  const attempt = state.attempts.find((item) => item.id === sessionId && item.type === "quiz-start");

  if (!attempt) {
    sendError(res, 404, "Session not found");
    return;
  }

  const correct = attempt.answerKey.reduce((count, answer, index) => {
    return count + (answers[index] === answer ? 1 : 0);
  }, 0);
  const total = attempt.answerKey.length;
  const accuracy = total ? correct / total : 0;
  const passed = accuracy >= 0.7;
  const pathProgress = ensurePathProgress(state, attempt.pathId);
  const sectionId = attempt.sectionId || "section-1";
  const key = completeKey(attempt.lessonId, attempt.levelId, sectionId);

  if (passed && !pathProgress.completedSections.includes(key)) {
    pathProgress.completedSections.push(key);
    const curriculum = buildCurriculum(attempt.pathId);
    const lesson = curriculum.find((item) => item.id === attempt.lessonId);
    const level = lesson?.levels.find((item) => item.id === attempt.levelId);
    const levelKey = completeKey(attempt.lessonId, attempt.levelId);
    if (lesson && level && isLevelComplete(pathProgress, lesson, level) && !pathProgress.completedLevels.includes(levelKey)) {
      pathProgress.completedLevels.push(levelKey);
    }
    const next = getNextNode(attempt.pathId, attempt.lessonId, attempt.levelId, sectionId);
    if (next) {
      pathProgress.currentLessonId = next.lessonId;
      pathProgress.currentLevelId = next.levelId;
      pathProgress.currentSectionId = next.sectionId;
    }
  }

  pathProgress.sectionAccuracy[key] = Number(accuracy.toFixed(2));
  pathProgress.lessonAccuracy[key] = Number(accuracy.toFixed(2));
  applyStreak(state.profile);
  state.profile.xp += Math.max(5, correct * 2 + (passed ? 10 : 0));
  state.attempts.push({
    id: randomUUID(),
    type: "quiz-complete",
    pathId: attempt.pathId,
    lessonId: attempt.lessonId,
    levelId: attempt.levelId,
    sectionId,
    correct,
    total,
    accuracy,
    passed,
    createdAt: new Date().toISOString()
  });

  await writeState(userId, state);
  sendJson(res, 200, {
    correct,
    total,
    accuracy,
    passed,
    explanations: attempt.questions.map((question) => ({
      prompt: question.prompt,
      correctAnswer: question.options[question.answer],
      explanation: question.explanation
    })),
    profile: publicProfile(state.profile),
    progress: state.progress[attempt.pathId],
    stats: summarizePath(state, attempt.pathId),
    curriculum: decorateCurriculum(state, attempt.pathId)
  });
}

async function startSimulation(res, url, userId) {
  const state = await readState(userId);
  const pathId = url.searchParams.get("pathId") || state.profile.activePathId;
  const lessonId = url.searchParams.get("lessonId") || "lesson-1";
  const scenarioIndex = Number(url.searchParams.get("index") || 0);
  const scenario = generateScenario({ pathId, lessonId, scenarioIndex });

  sendJson(res, 200, {
    ...scenario,
    choices: scenario.choices.map(({ safe, feedback, ...choice }) => choice)
  });
}

async function respondToSimulation(res, body, userId) {
  const state = await readState(userId);
  const pathId = body.pathId || state.profile.activePathId;
  const lessonId = body.lessonId || "lesson-1";
  const scenarioIndex = Number(body.scenarioIndex || 0);
  const scenario = generateScenario({ pathId, lessonId, scenarioIndex });
  const choice = scenario.choices.find((item) => item.id === body.choiceId);

  if (!choice) {
    sendError(res, 400, "Unknown choice");
    return;
  }

  const pathProgress = ensurePathProgress(state, pathId);
  if (choice.safe && !pathProgress.completedSimulations.includes(scenario.id)) {
    pathProgress.completedSimulations.push(scenario.id);
    state.profile.xp += 8;
  }
  applyStreak(state.profile);

  state.attempts.push({
    id: randomUUID(),
    type: "simulation",
    pathId,
    lessonId,
    scenarioId: scenario.id,
    choiceId: choice.id,
    safe: choice.safe,
    createdAt: new Date().toISOString()
  });

  await writeState(userId, state);
  sendJson(res, 200, {
    safe: choice.safe,
    feedback: choice.feedback,
    profile: publicProfile(state.profile),
    progress: state.progress[pathId],
    stats: summarizePath(state, pathId),
    curriculum: decorateCurriculum(state, pathId)
  });
}

async function issueCertificate(res, body, userId) {
  const state = await readState(userId);
  const pathId = body.pathId || state.profile.activePathId;
  const stats = summarizePath(state, pathId);

  if (!stats.isComplete) {
    sendError(res, 409, "Complete every lesson section before issuing a certificate");
    return;
  }

  let certificate = state.certificates.find((item) => item.pathId === pathId);
  if (!certificate) {
    certificate = {
      id: `CERT-${randomUUID().slice(0, 8).toUpperCase()}`,
      pathId,
      learnerName: state.profile.name,
      pathTitle: getPath(pathId).title,
      issuedAt: new Date().toISOString()
    };
    state.certificates.push(certificate);
    await writeState(userId, state);
  }

  sendJson(res, 200, { certificate });
}


/* ── LEADERBOARD ─────────────────────────────────────────────────────────── */
async function getLeaderboard(res, url, userId) {
  const scope = url.searchParams.get("scope") || "global";
  const rows  = await q("SELECT id, name, xp, streak FROM users ORDER BY xp DESC, streak DESC, created_at ASC");
  const ranked = rows.map((row, i) => ({
    id: row.id,
    name: row.name || "Learner",
    xp: parseInt(row.xp) || 0,
    streak: parseInt(row.streak) || 0,
    badge: "⭐",
    isMe: row.id === userId,
    rank: i + 1
  }));

  let result = ranked;
  if (scope === "friends") {
    const myIndex = ranked.findIndex(p => p.isMe);
    const start = Math.max(0, myIndex - 3);
    result = ranked.slice(start, start + 7);
  } else {
    result = ranked.slice(0, 20);
  }
  sendJson(res, 200, { players: result });
}

/* ── QUESTS ──────────────────────────────────────────────────────────────── */
async function getQuests(res, userId) {
  const state  = await readState(userId);
  const pathId = state.profile.activePathId;
  const stats  = summarizePath(state, pathId);
  const xp     = state.profile.xp || 0;
  const streak = state.profile.streak || 0;

  const quests = [
    { category:"Daily", items:[
      { id:"daily-quiz",   icon:"📝", bg:"#fffbea", title:"Daily Quiz",      desc:"Complete 1 quiz section today",  progress:Math.min(stats.completedSections > 0 ? 1 : 0, 1), total:1, reward:50,  rewardLabel:"XP", done:stats.completedSections > 0 },
      { id:"daily-streak", icon:"🔥", bg:"#fff7ed", title:"Keep the Streak", desc:"Maintain your daily streak",     progress:Math.min(streak,1),  total:1, reward:30,  rewardLabel:"XP", done:streak >= 1 }
    ]},
    { category:"Milestone", items:[
      { id:"mile-10",    icon:"🏅", bg:"#f0fdf4", title:"Section Grinder",  desc:"Complete 10 quiz sections",       progress:Math.min(stats.completedSections,10), total:10, reward:200, rewardLabel:"XP", done:stats.completedSections >= 10 },
      { id:"mile-5sim",  icon:"🎭", bg:"#ede9fe", title:"Scenario Master",  desc:"Complete 5 simulations",          progress:Math.min(stats.completedSimulations,5), total:5, reward:150, rewardLabel:"XP", done:stats.completedSimulations >= 5 },
      { id:"mile-500xp", icon:"⭐", bg:"#fffbea", title:"XP Collector",     desc:"Earn 500 XP total",               progress:Math.min(xp,500),    total:500, reward:100, rewardLabel:"XP", done:xp >= 500 },
      { id:"mile-str7",  icon:"🔥", bg:"#fff7ed", title:"Week Warrior",     desc:"Reach a 7-day streak",            progress:Math.min(streak,7),  total:7,   reward:300, rewardLabel:"XP", done:streak >= 7 }
    ]},
    { category:"Champion", items:[
      { id:"champ-all",  icon:"🏆", bg:"#fffbea", title:"Path Champion",    desc:"Complete every lesson section",   progress:stats.completedSections, total:stats.totalSections, reward:1000, rewardLabel:"XP", done:stats.isComplete },
      { id:"champ-cert", icon:"🎓", bg:"#e0f2fe", title:"Certified Defender",desc:"Earn your cybersecurity certificate", progress:state.certificates&&state.certificates.length>0?1:0, total:1, reward:500, rewardLabel:"XP", done:state.certificates&&state.certificates.length>0 }
    ]}
  ];
  sendJson(res, 200, { quests });
}

/* ── CHATBOT ─────────────────────────────────────────────────────────────── */
const CHATBOT_MAX_MESSAGE_LENGTH = 700;
const CHATBOT_REDIRECT =
  "I can help with NETRA and cybersecurity topics only. Try asking about passwords, phishing, scams, safe gaming, privacy, quizzes, quests, progress, or certificates.";

const CYBER_TOPIC_ANSWERS = [
  {
    keywords: ["password", "passphrase", "password manager", "login"],
    reply: "Use a different long password or passphrase for every important account. A password manager can remember them for you, and multi-factor authentication adds a second lock."
  },
  {
    keywords: ["mfa", "2fa", "two factor", "multi factor", "otp", "login code", "verification code"],
    reply: "MFA protects your account with something extra, like a code or approval prompt. Never share OTPs or login codes, even with friends, because they can unlock your account."
  },
  {
    keywords: ["phish", "fake link", "suspicious link", "email scam", "sender", "sms scam"],
    reply: "Phishing messages create urgency so you click before thinking. Check the sender, avoid surprise links, and open the real app or website directly when an account or payment is involved."
  },
  {
    keywords: ["scam", "fraud", "upi", "bank", "payment", "money", "shopping", "refund"],
    reply: "Treat urgent money requests, refund links, QR codes, and too-good-to-be-true offers as warning signs. Verify through the official app, bank number, or a trusted adult before paying or sharing details."
  },
  {
    keywords: ["malware", "virus", "download", "apk", "mod", "antivirus", "ransomware"],
    reply: "Only install apps from trusted stores or official websites, and avoid files that ask you to disable security. Keep the device updated, scan suspicious downloads, and back up important files."
  },
  {
    keywords: ["privacy", "personal information", "permission", "location", "camera", "data"],
    reply: "Share the minimum personal information needed, especially your address, school, phone number, photos, and location. Review app permissions and remove access that an app does not truly need."
  },
  {
    keywords: ["wifi", "wi-fi", "public wifi", "vpn", "hotspot", "network"],
    reply: "Public Wi-Fi is useful but not ideal for banking, school logins, or private work. Use mobile data or a trusted VPN for sensitive tasks, and turn off auto-join for unknown networks."
  },
  {
    keywords: ["gaming", "game", "chat", "stranger", "friend request", "discord"],
    reply: "Keep gaming chats safe by using privacy settings, avoiding personal details, and being careful with free skins, mods, and gift links. If someone pressures or threatens you, block, report, and tell a trusted adult."
  },
  {
    keywords: ["bully", "harass", "report", "abuse", "threat"],
    reply: "Do not reply to hurtful or threatening messages in the moment. Save evidence, block or report the account, and involve a trusted adult, teacher, or platform support."
  },
  {
    keywords: ["hacked", "compromised", "stolen account", "account taken", "breach"],
    reply: "If an account may be hacked, change the password from a safe device, turn on MFA, sign out other sessions, and check recovery email or phone details. Report it to the platform and warn contacts not to trust strange messages from the account."
  },
  {
    keywords: ["update", "patch", "phone lock", "screen lock", "device", "backup"],
    reply: "Updates fix security holes, so install them for your phone, browser, and apps. Use a strong screen lock, enable device finding, and keep backups for important photos and documents."
  },
  {
    keywords: ["ai scam", "deepfake", "voice clone", "fake video"],
    reply: "AI scams can copy voices, faces, or writing style to create pressure. Verify unusual requests through another trusted channel before sending money, codes, documents, or private photos."
  }
];

function normalizeChatText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function chatbotContext(state) {
  const pathId = state.profile.activePathId;
  const pathConfig = getPath(pathId);
  const progress = ensurePathProgress(state, pathId);
  const curriculum = buildCurriculum(pathId);
  const stats = summarizePath(state, pathId);
  const currentLesson = curriculum.find((lesson) => lesson.id === progress.currentLessonId) || curriculum[0];
  const currentLevel = currentLesson?.levels.find((level) => level.id === progress.currentLevelId) || currentLesson?.levels[0];
  const currentSection = currentLevel?.sections.find((section) => section.id === progress.currentSectionId) || currentLevel?.sections[0];
  const certificate = state.certificates.find((item) => item.pathId === pathId) || null;

  return {
    path: pathConfig,
    progress,
    stats,
    currentLesson,
    currentLevel,
    currentSection,
    certificate,
    profile: state.profile
  };
}

function answerAppQuestion(text, context) {
  const pathTitle = context.path.title;
  const lessonTitle = context.currentLesson?.title || "your current lesson";
  const levelTitle = context.currentLevel?.title || "the next level";
  const sectionTitle = context.currentSection?.title || "the next section";

  if (hasAny(text, ["progress", "status", "completed", "how far", "finish"])) {
    return `You are on ${pathTitle} with ${context.stats.completedSections} of ${context.stats.totalSections} quiz sections complete across ${context.stats.totalLevels} levels. You have also finished ${context.stats.completedSimulations} of ${context.stats.scenarioTarget} simulations.`;
  }

  if (hasAny(text, ["next", "continue", "what should i do", "where do i start", "start"])) {
    return `Continue in the Learn tab with ${lessonTitle}, ${levelTitle}, ${sectionTitle}. Finish the section quiz with at least 70% to unlock the next section.`;
  }

  if (hasAny(text, ["quiz", "lesson", "level", "section", "learn", "locked", "unlock"])) {
    return "The Learn tab is the main training path. Each lesson has 5 levels, each level has 5 sections, and passing one section unlocks the next.";
  }

  if (hasAny(text, ["simulation", "scenario", "mission"])) {
    return "Simulations are short real-life cyber safety choices. Read the scenario, choose the safest action, and the app explains why that choice is safe or risky.";
  }

  if (hasAny(text, ["quest", "daily", "reward"])) {
    return "Quests are extra goals that reward steady practice, like completing quizzes, keeping a streak, finishing simulations, and earning XP milestones.";
  }

  if (hasAny(text, ["leaderboard", "rank", "score"])) {
    return "The leaderboard compares XP and streak progress so learners can stay motivated. Use it as friendly practice energy, not as pressure.";
  }

  if (hasAny(text, ["xp", "streak", "points"])) {
    return `You currently have ${context.profile.xp || 0} XP and a ${context.profile.streak || 0}-day streak. Complete quizzes and simulations to earn more XP and keep the streak alive.`;
  }

  if (hasAny(text, ["certificate", "certification", "badge"])) {
    if (context.certificate) {
      return `You already earned the ${pathTitle} certificate. Open the certificate button in the top bar to view it again.`;
    }
    return `Complete all ${context.stats.totalSections} quiz sections in ${pathTitle} to issue your Cybersecurity Readiness certificate. You have ${context.stats.totalSections - context.stats.completedSections} sections left.`;
  }

  if (hasAny(text, ["profile", "name", "avatar", "language", "grade", "path"])) {
    return "Use the profile button in the top bar to update your name, avatar, role, language, or grade path. Changing the path switches the lessons to the right age group.";
  }

  if (hasAny(text, ["topic", "teach", "course", "curriculum", "what is this app", "cybersafe", "academy"])) {
    return `NETRA teaches online safety through quizzes, simulations, quests, XP, streaks, and a final certificate. Your current path is ${pathTitle}, and the next focus is ${lessonTitle}.`;
  }

  return null;
}

function isAppQuestion(text) {
  return hasAny(text, [
    "cybersafe", "academy", "this app", "the app", "learn tab", "quest", "leaderboard",
    "certificate", "quiz", "lesson", "level", "section", "simulation", "profile", "avatar",
    "xp", "streak", "grade path", "progress", "unlock", "next", "continue",
    "what should i do", "where do i start"
  ]);
}

function isHarmfulCyberRequest(text) {
  return hasAny(text, [
    "hack someone", "hack account", "hack instagram", "hack facebook", "hack whatsapp",
    "steal password", "steal otp", "bypass login", "crack password", "crack wifi",
    "make malware", "create malware", "keylogger", "phishing page", "phishing kit",
    "ddos", "spy on", "break into"
  ]);
}

function isGreeting(text) {
  return ["hello", "hi", "hey", "namaste"].includes(text);
}

function answerCyberQuestion(text) {
  if (isHarmfulCyberRequest(text)) {
    return "I cannot help break into accounts, steal passwords, or create attacks. I can help you learn the safe side: securing accounts, spotting scams, reporting abuse, and recovering from a hacked account.";
  }

  if (isGreeting(text)) {
    return "Hi, I am NETRA Buddy. Ask me about this app, passwords, phishing, scams, privacy, safe gaming, or what to do next in your training.";
  }

  if (hasAny(text, ["cyber security", "cybersecurity", "online safety", "internet safety"])) {
    return "Cybersecurity means protecting your accounts, devices, money, and personal information online. The safest habits are pause before clicking, verify through trusted channels, use strong unique passwords, turn on MFA, and keep devices updated.";
  }

  const topic = CYBER_TOPIC_ANSWERS.find((item) => hasAny(text, item.keywords));
  if (topic) return topic.reply;

  const cyberWords = [
    "safe", "security", "secure", "account", "browser", "url", "website", "social media",
    "instagram", "whatsapp", "facebook", "google", "email", "phone", "laptop", "school account"
  ];

  if (hasAny(text, cyberWords)) {
    return "A good cyber-safety rule is pause, check the source, and use the official app or website directly. Do not share passwords, OTPs, payment details, private photos, or personal information unless you are sure the request is real.";
  }

  return null;
}

async function chatbotRespond(res, body, userId) {
  const rawMessage = String(body.message || "").trim().slice(0, CHATBOT_MAX_MESSAGE_LENGTH);

  if (!rawMessage) {
    sendJson(res, 400, { error: "Message is required" });
    return;
  }

  const state = await readState(userId);
  const text = normalizeChatText(rawMessage);
  const context = chatbotContext(state);
  const appReply = isAppQuestion(text) ? answerAppQuestion(text, context) : null;
  const cyberReply = answerCyberQuestion(text);
  const reply = appReply || cyberReply || CHATBOT_REDIRECT;

  sendJson(res, 200, { reply });
}

async function handleApi(req, res, url) {
  try {
    // Inject userId from session into all state calls
    const activeUserId = await getActiveUser(req);

    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      await bootstrap(res, activeUserId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/path/select") {
      await selectPath(res, await readBody(req), activeUserId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/profile") {
      await saveProfile(res, await readBody(req), activeUserId);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      await startSession(res, url, activeUserId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/session/complete") {
      await completeSession(res, await readBody(req), activeUserId);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/simulation") {
      await startSimulation(res, url, activeUserId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/simulation/respond") {
      await respondToSimulation(res, await readBody(req), activeUserId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/certificate/issue") {
      await issueCertificate(res, await readBody(req), activeUserId);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/leaderboard") { await getLeaderboard(res, url, activeUserId); return; }
    if (req.method === "GET" && url.pathname === "/api/quests")      { await getQuests(res, activeUserId); return; }
    if (req.method === "POST" && url.pathname === "/api/chatbot")    { await chatbotRespond(res, await readBody(req), activeUserId); return; }
    if (req.method === "POST" && url.pathname === "/api/logout")       { await handleLogout(req, res); return; }
    if (req.method === "POST" && url.pathname === "/api/signup")      { await handleSignup(req, res); return; }
    if (req.method === "POST" && url.pathname === "/api/login")       { await handleLogin(req, res); return; }
    if (req.method === "POST" && url.pathname === "/api/auth/google") { await handleGoogleAuth(req, res); return; }
    if (req.method === "GET"  && url.pathname === "/api/google-client-id") { sendJson(res, 200, { clientId: GOOGLE_CLIENT_ID || null }); return; }
    if (req.method === "GET"  && url.pathname === "/api/me")          { await handleMe(req, res); return; }
        sendError(res, 404, "API route not found");
  } catch (error) {
    sendError(res, 500, error.message || "Server error");
  }
}


async function handleSignup(req, res) {
  const body = await readBody(req);
  const { name, email, password } = body;
  if (!name || !email || !password) { sendError(res, 400, "Name, email and password are required."); return; }
  if (password.length < 6) { sendError(res, 400, "Password must be at least 6 characters."); return; }
  const result = await registerUser(name, email, password);
  if (result.error) { sendError(res, 400, result.error); return; }
  const token = await createDbSession(result.userId);
  setSessionCookie(res, token);
  sendJson(res, 200, { ok: true, name: result.name });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const { email, password } = body;
  if (!email || !password) { sendError(res, 400, "Email and password are required."); return; }
  const result = await loginUser(email, password);
  if (result.error) { sendError(res, 401, result.error); return; }
  const token = await createDbSession(result.userId);
  setSessionCookie(res, token);
  sendJson(res, 200, { ok: true, name: result.name });
}

async function handleMe(req, res) {
  const userId = await getActiveUser(req);
  if (!userId) { sendJson(res, 200, { loggedIn: false }); return; }
  const account = await getUserById(userId);
  sendJson(res, 200, { loggedIn: true, name: account?.name || "User", userId });
}

async function handleLogout(req, res) {
  const token = getSessionToken(req);
  await deleteDbSession(token);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

// ── GOOGLE OAUTH ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

let _googleKeys = null;
let _googleKeysFetchedAt = 0;
async function getGooglePublicKeys() {
  if (_googleKeys && Date.now() - _googleKeysFetchedAt < 5 * 60 * 1000) return _googleKeys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  _googleKeys = await r.json();
  _googleKeysFetchedAt = Date.now();
  return _googleKeys;
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID not configured");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const decode = (s) => Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"), "base64url");
  const header  = JSON.parse(decode(parts[0]));
  const payload = JSON.parse(decode(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("Token expired");
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error("Token audience mismatch");
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com")
    throw new Error("Token issuer mismatch");
  const { keys } = await getGooglePublicKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("Public key not found");
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  const signingInput = Buffer.from(parts[0] + "." + parts[1]);
  const signature    = decode(parts[2]);
  const valid = await globalThis.crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", cryptoKey, signature, signingInput
  );
  if (!valid) throw new Error("Signature invalid");
  return payload;
}

async function handleGoogleAuth(req, res) {
  if (!GOOGLE_CLIENT_ID) {
    sendError(res, 501, "Google Sign-In is not configured. Set GOOGLE_CLIENT_ID env var.");
    return;
  }
  const { credential } = await readBody(req);
  if (!credential) { sendError(res, 400, "Missing credential"); return; }
  let payload;
  try { payload = await verifyGoogleIdToken(credential); }
  catch (e) { sendError(res, 401, "Google token verification failed: " + e.message); return; }
  const { email, name, sub: googleSub } = payload;
  if (!email) { sendError(res, 400, "Google account has no email"); return; }
  const emailKey = email.toLowerCase().trim();
  let account = await getUserByEmail(emailKey);
  if (!account) {
    const userId = "goog-" + googleSub;
    const now    = new Date().toISOString();
    await q(`
      INSERT INTO users (id, name, email, password_hash, created_at, xp, streak, role, preferred_language, active_path_id, onboarded)
      VALUES ($1,$2,$3,NULL,$4,0,0,'Student','English','grades-6-8',0)
      ON CONFLICT (email) DO NOTHING
    `, [userId, name || emailKey.split("@")[0], emailKey, now]);
    const initial = createInitialState();
    initial.profile.name = name || emailKey.split("@")[0];
    await writeState(userId, initial);
    account = await getUserByEmail(emailKey);
  }
  const token = await createDbSession(account.id);
  setSessionCookie(res, token);
  sendJson(res, 200, { ok: true, name: account.name });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  // Redirect unauthenticated users to login page
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const userId = await getActiveUser(req);
    if (!userId) {
      const loginPath = path.join(__dirname, "public", "login.html");
      const content = await fsp.readFile(loginPath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
      return;
    }
  }
  // Serve login page without auth check
  if (url.pathname === "/login" || url.pathname === "/login.html") {
    const loginPath = path.join(__dirname, "public", "login.html");
    const content = await fsp.readFile(loginPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
    return;
  }

  await sendStatic(req, res, url.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NETRA running at http://localhost:${PORT}`);
});