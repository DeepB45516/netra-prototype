/* ── STATE ─────────────────────────────────────────────────────────────── */
const state = {
  data: null,
  selected: null,
  session: null,
  quizIndex: 0,
  answers: [],
  finalAnswers: [],
  retryQueue: [],
  answerFeedback: null,
  simulation: null,
  scenarioIndex: 0,
  sectionStartTs: null,
  sectionStartXp: 0,
  avatarDraft: null,
  settingsAvatarDraft: null,
  translateQueue: [],
  translatePending: false,
  lastXp: 0,
  energy: 20,
  correctStreak: 0,
  energyRestoreTimer: null
};

/* ── DOM REFS ─────────────────────────────────────────────────────────────── */
const els = {
  authScreen:           document.querySelector("#authScreen"),
  loginForm:            document.querySelector("#loginForm"),
  avatarInput:          document.querySelector("#avatarInput"),
  avatarPreview:        document.querySelector("#avatarPreview"),
  profileName:          document.querySelector("#profileName"),
  profileRole:          document.querySelector("#profileRole"),
  profileLanguage:      document.querySelector("#profileLanguage"),
  levelPicker:          document.querySelector("#levelPicker"),
  loginMessage:         document.querySelector("#loginMessage"),
  pathMap:              document.querySelector("#pathMap"),
  levelTabs:            document.querySelector("#levelTabs"),
  pathTitle:            document.querySelector("#pathTitle"),
  activePathLabel:      document.querySelector("#activePathLabel"),
  streakValue:          document.querySelector("#streakValue"),
  xpValue:              document.querySelector("#xpValue"),
  progressTitle:        document.querySelector("#progressTitle"),
  progressMeter:        document.querySelector("#progressMeter"),
  simulationTitle:      document.querySelector("#simulationTitle"),
  activityEyebrow:      document.querySelector("#activityEyebrow"),
  activityTitle:        document.querySelector("#activityTitle"),
  activityBody:         document.querySelector("#activityBody"),
  coachLine:            document.querySelector("#coachLine"),
  profileButton:        document.querySelector("#profileButton"),
  miniAvatar:           document.querySelector("#miniAvatar"),
  profileButtonName:    document.querySelector("#profileButtonName"),
  profileModal:         document.querySelector("#profileModal"),
  profileForm:          document.querySelector("#profileForm"),
  closeProfile:         document.querySelector("#closeProfile"),
  settingsAvatarInput:  document.querySelector("#settingsAvatarInput"),
  settingsAvatarPreview:document.querySelector("#settingsAvatarPreview"),
  settingsName:         document.querySelector("#settingsName"),
  settingsRole:         document.querySelector("#settingsRole"),
  settingsLanguage:     document.querySelector("#settingsLanguage"),
  settingsLevelPicker:  document.querySelector("#settingsLevelPicker"),
  settingsMessage:      document.querySelector("#settingsMessage"),
  chatMessages:         document.querySelector("#chatMessages"),
  chatForm:             document.querySelector("#chatForm"),
  chatInput:            document.querySelector("#chatInput"),
  certificateButton:    document.querySelector("#certificateButton"),
  certificateModal:     document.querySelector("#certificateModal"),
  closeCertificate:     document.querySelector("#closeCertificate"),
  issueCertificate:     document.querySelector("#issueCertificate"),
  certificateText:      document.querySelector("#certificateText"),
  activityPage:         document.querySelector("#activityPage"),
  activityEyebrow:      document.querySelector("#activityEyebrow"),
  activityTitle:        document.querySelector("#activityTitle"),
  activityBody:         document.querySelector("#activityBody"),
  levelTabs:            document.querySelector("#levelTabs"),
  backToMap:            document.querySelector("#backToMap")
};

/* ── API HELPERS ─────────────────────────────────────────────────────────── */
async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

/* ── LANGUAGE ────────────────────────────────────────────────────────────── */
function currentLanguage() {
  if (document.body.classList.contains("auth-mode") && els.profileLanguage.value)
    return els.profileLanguage.value;
  if (!els.profileModal.classList.contains("hidden") && els.settingsLanguage.value)
    return els.settingsLanguage.value;
  return state.data?.profile?.preferredLanguage || "English";
}
function t(key, params = {}) { return window.I18N.t(currentLanguage(), key, params); }

/* ── MYMEMORY TRANSLATION ─────────────────────────────────────────────────── */
const MYMEMORY_LANGS = {
  English: null,
  Assamese:"as", Bengali:"bn",   Bodo:"brx",     Dogri:"doi",
  Gujarati:"gu", Hindi:"hi",     Kannada:"kn",   Kashmiri:"ks",
  Konkani:"kok", Maithili:"mai", Malayalam:"ml", Manipuri:"mni",
  Marathi:"mr",  Nepali:"ne",    Odia:"or",      Punjabi:"pa",
  Sanskrit:"sa", Santali:"sat",  Sindhi:"sd",    Tamil:"ta",
  Telugu:"te",   Urdu:"ur",      "Indian Sign Language": null
};

const translationMisses = new Set();

const HTML_LANGS = {
  English:"en", Assamese:"as", Bengali:"bn", Bodo:"brx", Dogri:"doi",
  Gujarati:"gu", Hindi:"hi", Kannada:"kn", Kashmiri:"ks", Konkani:"kok",
  Maithili:"mai", Malayalam:"ml", Manipuri:"mni", Marathi:"mr", Nepali:"ne",
  Odia:"or", Punjabi:"pa", Sanskrit:"sa", Santali:"sat", Sindhi:"sd",
  Tamil:"ta", Telugu:"te", Urdu:"ur", "Indian Sign Language":"en"
};

async function myMemoryTranslate(text, langCode) {
  if (!langCode || !text || text.length < 2) return text;
  try {
    const url = "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 500)) + "&langpair=en|" + langCode +
      "&de=cybersafeacademy@learn.app";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const translated = json?.responseData?.translatedText;
    if (!translated || translated.startsWith("QUERY") || translated === text) return text;
    return translated;
  } catch { return text; }
}

// In-flight deduplication: if a batch is already running for the same texts+lang,
// reuse the same promise instead of firing a duplicate API call.
const _inFlight = new Map();

async function translateBatch(texts, language) {
  if (language === "English" || !texts.length) return {};
  const langCode = MYMEMORY_LANGS[language];
  if (!langCode) {
    texts.forEach(tx => translationMisses.add(`${language}:${tx}`));
    return {};
  }

  // Deduplicate and filter already-known texts
  const needed = [...new Set(
    texts.filter(tx =>
      tx && typeof tx === "string" && tx.length > 1 &&
      !window.I18N.hasCached(language, tx) &&
      !translationMisses.has(`${language}:${tx}`)
    )
  )];
  if (!needed.length) return {};

  const map = {};

  // Split into short segments (MyMemory 500 char limit) and fire 4 at a time
  const segments = needed.map(tx => ({
    original: tx,
    // break long texts at sentence boundaries to stay under 500 chars
    query: tx.length <= 480 ? tx : tx.slice(0, 480)
  }));

  const CHUNK = 4;
  for (let i = 0; i < segments.length; i += CHUNK) {
    const chunk = segments.slice(i, i + CHUNK);

    // Deduplicate in-flight: reuse promise if identical call is already running
    const promises = chunk.map(({ original, query }) => {
      const key = `${language}:${query}`;
      if (_inFlight.has(key)) return _inFlight.get(key);
      const p = myMemoryTranslate(query, langCode).then(result => {
        _inFlight.delete(key);
        return { original, result };
      });
      _inFlight.set(key, p);
      return p;
    });

    const results = await Promise.all(promises);
    results.forEach(({ original, result }) => {
      if (result && result !== original) {
        map[original] = result;
        window.I18N.cacheTranslation(language, original, result);
      } else {
        translationMisses.add(`${language}:${original}`);
      }
    });
  }
  return map;
}

function queueTranslation(texts) {
  const lang = currentLanguage();
  if (lang === "English") return;
  const needed = texts.filter(tx => tx && typeof tx === "string" && tx.length > 1 && !window.I18N.hasCached(lang, tx) && !translationMisses.has(`${lang}:${tx}`));
  if (!needed.length) return;
  state.translateQueue.push(...needed);
  scheduleTranslation();
}

async function prepareLanguage(language) {
  if (!language || language === "English") return;
  await translateBatch(window.I18N.staticTexts(), language);
}

let translateTimer = null;
function scheduleTranslation() {
  if (translateTimer) return;
  translateTimer = setTimeout(async () => {
    translateTimer = null;
    if (state.translatePending || !state.translateQueue.length) return;
    const lang = currentLanguage();
    if (lang === "English") { state.translateQueue = []; return; }
    state.translatePending = true;
    const batch = [...new Set(state.translateQueue)];
    state.translateQueue = [];
    await translateBatch(batch, lang);
    state.translatePending = false;
    if (state.data) {
      applyStaticTranslations();
      renderHeader();
      renderPathMap();
      if (state.session) renderQuestion();
      else if (state.simulation) renderSimulation();
      else if (!state.selected) updateActivityHead({ eyebrow: t("ready"), title: t("chooseUnlockedLevel") });
      if (activeTab === "quests") renderQuests();
      if (activeTab === "leaderboard") renderLeaderboard();
    }
  }, 0);
}

function showTranslatingBadge() {
  let badge = document.querySelector(".translating-badge");
  if (!badge) { badge = document.createElement("div"); badge.className = "translating-badge"; document.body.appendChild(badge); }
  badge.textContent = "◈ " + t("translating");
}
function hideTranslatingBadge() { document.querySelector(".translating-badge")?.remove(); }

/* ── CONTENT TRANSLATION HELPER ─────────────────────────────────────────── */
function c(text) {
  if (!text) return text;
  const translated = window.I18N.contentText(currentLanguage(), text);
  if (translated === text) queueTranslation([text]);
  return translated;
}

/* ── STATIC TRANSLATIONS ─────────────────────────────────────────────────── */
function applyStaticTranslations() {
  const lang = currentLanguage();
  document.documentElement.lang = HTML_LANGS[lang] || "en";
  if (lang !== "English") queueTranslation(window.I18N.staticTexts());
  document.querySelectorAll("[data-i18n]").forEach(el => {
    if (el.dataset.dynamicI18n === "true") return;
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const text = t(el.dataset.i18nTitle);
    el.setAttribute("title", text);
    el.setAttribute("aria-label", text);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
}

/* ── UTILS ──────────────────────────────────────────────────────────────── */
function translatedRole(role) { return t(String(role || "Student").toLowerCase()); }

function pathText(path, field) {
  const keys = {
    "grades-6-8":     { title:"pathGrades68",  label:"beginner",       audience:"middleSchool" },
    "grades-9-10":    { title:"pathGrades910",  label:"intermediate",   audience:"highSchool" },
    "grades-11-12":   { title:"pathGrades1112", label:"advanced",       audience:"olderStudents" },
    "adults-parents": { title:"pathAdults",     label:"familyDefender", audience:"parentsCaregivers" }
  };
  return t(keys[path.id]?.[field]) || path[field];
}

const PATH_THEME_CLASSES = ["theme-kids", "theme-teen", "theme-senior", "theme-adult"];

function pathTheme(pathId) {
  if (pathId === "grades-6-8") return "kids";
  if (pathId === "grades-9-10") return "teen";
  if (pathId === "grades-11-12") return "senior";
  return "adult";
}

function applyPathTheme(pathId) {
  const theme = pathTheme(pathId);
  document.body.classList.remove(...PATH_THEME_CLASSES);
  document.body.classList.add(`theme-${theme}`);
  document.body.dataset.pathTheme = theme;
}

function mapCopy(pathId) {
  const copy = {
    "grades-6-8": {
      kicker: t("mapKickerGrades68"),
      title: t("mapTitleGrades68"),
      summary: t("mapSummaryGrades68")
    },
    "grades-9-10": {
      kicker: t("mapKickerGrades910"),
      title: t("mapTitleGrades910"),
      summary: t("mapSummaryGrades910")
    },
    "grades-11-12": {
      kicker: t("mapKickerGrades1112"),
      title: t("mapTitleGrades1112"),
      summary: t("mapSummaryGrades1112")
    },
    "adults-parents": {
      kicker: t("mapKickerAdults"),
      title: t("mapTitleAdults"),
      summary: t("mapSummaryAdults")
    }
  };
  return copy[pathId] || copy["grades-6-8"];
}

function lessonArtLabel(pathId) {
  if (pathId === "adults-parents") return t("artFamily");
  if (pathId === "grades-11-12") return t("artSenior");
  if (pathId === "grades-9-10") return t("artTeen");
  return t("artKids");
}

function levelFocusTitle(topic, levelNumber) {
  const keys = ["levelFocusBasics", "levelFocusHabits", "levelFocusDosDonts", "levelFocusRealLife", "levelFocusMastery"];
  return t(keys[levelNumber - 1] || "levelFocusFallback", { topic, number: levelNumber });
}

function levelFocusDescription(levelNumber) {
  return t(`levelDescription${levelNumber}`) || t("levelDescriptionFallback");
}

function sectionLearningTitle(topic, levelNumber, sectionNumber) {
  const cleanTopic = String(topic || "Cyber Safety").replace(/\s+/g, " ").trim();
  const index = (levelNumber - 1) * 5 + sectionNumber;
  return t(`sectionTitle${index}`, { topic: cleanTopic }) || t("sectionTitleFallback", { topic: cleanTopic });
}

function sectionLearningDescription(sectionNumber) {
  return t(`sectionDescription${sectionNumber}`) || t("sectionDescriptionFallback");
}

function attr(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function levelTitle(n) {
  const keys = ["learn", "practice", "mission", "review", "challengeMode"];
  return `${t(keys[n - 1] || "level")} ${n}`;
}
function sectionTitle(n) { return `${t("section")} ${n}`; }

function initials(name) {
  return String(name || t("profile")).trim().split(/\s+/).slice(0,2).map(p => p[0]?.toUpperCase() || "").join("");
}

function paintAvatar(element, profile, draft = null) {
  const image = draft || profile.avatarDataUrl;
  element.textContent = image ? "" : initials(profile.name);
  element.style.setProperty("--avatar-color", profile.avatarColor || "#00c9a7");
  element.style.backgroundImage = image ? `url("${image}")` : "";
}

function fillSelect(select, options, selectedValue) {
  select.innerHTML = options.map(opt => `<option value="${opt}" ${opt === selectedValue ? "selected" : ""}>${opt}</option>`).join("");
}
function fillRoleSelect(select, selectedValue) {
  const roles = ["Student","Parent","Teacher"];
  select.innerHTML = roles.map(r => `<option value="${r}" ${r === selectedValue ? "selected" : ""}>${translatedRole(r)}</option>`).join("");
}

/* ── LEVEL PICKER (shared by onboarding + settings) ──────────────────────── */
function renderLevelPicker(container, selectedPathId) {
  container.innerHTML = `<legend data-i18n="chooseLevel">${t("chooseLevel")}</legend>`;
  state.data.paths.forEach(path => {
    const label = document.createElement("label");
    label.className = `level-option theme-option theme-option-${pathTheme(path.id)}`;
    label.style.setProperty("--accent", path.accent);
    label.innerHTML = `
      <input type="radio" name="activePathId" value="${path.id}" ${path.id === selectedPathId ? "checked" : ""} />
      <span>
        <strong>${pathText(path, "title")}</strong>
        <small>${pathText(path, "label")} — ${path.lessons} ${t("lessons")} — ${path.levelsPerLesson} ${t("levelsEach")} — ${path.sectionsPerLevel} ${t("sectionsEach")} — ${path.questionsPerSection} ${t("questionsPerSection")}</small>
      </span>`;
    container.append(label);
  });
}

/* ── POPULATE FORMS ──────────────────────────────────────────────────────── */
function populateLoginForm() {
  const { profile, languages } = state.data;
  applyStaticTranslations();
  els.profileName.value = profile.name || "";
  fillRoleSelect(els.profileRole, profile.role || "Student");
  fillSelect(els.profileLanguage, languages, profile.preferredLanguage || "English");
  renderLevelPicker(els.levelPicker, profile.activePathId);
  paintAvatar(els.avatarPreview, profile, state.avatarDraft);
}

function populateSettingsForm() {
  const { profile, languages } = state.data;
  applyStaticTranslations();
  els.settingsName.value = profile.name || "";
  fillRoleSelect(els.settingsRole, profile.role || "Student");
  fillSelect(els.settingsLanguage, languages, profile.preferredLanguage || "English");
  renderLevelPicker(els.settingsLevelPicker, profile.activePathId);
  paintAvatar(els.settingsAvatarPreview, profile, state.settingsAvatarDraft);
}

function selectedLoginPath() {
  return els.loginForm.querySelector("input[name='activePathId']:checked")?.value || state.data.profile.activePathId;
}

function profilePayload(source) {
  const avatarDataUrl = source === "settings"
    ? state.settingsAvatarDraft ?? state.data.profile.avatarDataUrl
    : state.avatarDraft ?? state.data.profile.avatarDataUrl;

  if (source === "settings") {
    return {
      name: els.settingsName.value,
      role: els.settingsRole.value,
      preferredLanguage: els.settingsLanguage.value,
      activePathId: els.settingsLevelPicker.querySelector("input[name='activePathId']:checked")?.value || state.data.profile.activePathId,
      avatarColor: state.data.profile.avatarColor,
      avatarDataUrl,
      avatarConfig: null,
    };
  }
  return {
    name: els.profileName.value,
    role: els.profileRole.value,
    preferredLanguage: els.profileLanguage.value,
    activePathId: selectedLoginPath(),
    avatarColor: state.data.profile.avatarColor,
    avatarDataUrl,
    avatarConfig: null,
  };
}

/* ── AVATAR RESIZE ───────────────────────────────────────────────────────── */
async function resizeAvatar(file) {
  if (!file) return null;
  const dataUrl = await new Promise((res,rej) => { const r = new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
  const image   = await new Promise((res,rej) => { const img = new Image(); img.onload=()=>res(img); img.onerror=rej; img.src=dataUrl; });
  const size = 180, canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  const src = Math.min(image.width, image.height);
  ctx.drawImage(image, (image.width-src)/2, (image.height-src)/2, src, src, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/* ── SAVE PROFILE ─────────────────────────────────────────────────────────── */
async function saveProfile(source) {
  const message = source === "settings" ? els.settingsMessage : els.loginMessage;
  message.textContent = "";
  try {
    const data = await api("/api/profile", { method:"POST", body:JSON.stringify(profilePayload(source)) });
    state.avatarDraft = null;
    state.settingsAvatarDraft = null;
    els.profileModal.classList.add("hidden");
    await prepareLanguage(data.profile.preferredLanguage);
    setData(data);
  } catch(err) { message.textContent = err.message; }
}

function resetActivityPanel() {
  state.selected = null;
  state.session = null;
  state.simulation = null;
  state.quizIndex = 0;
  state.answers = [];
  state.finalAnswers = [];
  state.retryQueue = [];
  state.answerFeedback = null;
  state.sectionStartTs = null;
  state.sectionStartXp = 0;
  if (els.levelTabs) els.levelTabs.innerHTML = "";
  hideActivityPage();
}

function showActivityPage() {
  els.activityPage.classList.remove("hidden");
  document.body.classList.add("activity-open");
  els.activityPage.scrollTop = 0;

  // Smooth slide-up + fade transition
  els.activityPage.classList.remove("page-enter");
  void els.activityPage.offsetWidth; // reflow
  els.activityPage.classList.add("page-enter");
}

function hideActivityPage() {
  els.activityPage.classList.add("hidden");
  document.body.classList.remove("activity-open");
  updateActivityHead({ eyebrow: t("ready"), title: t("chooseUnlockedLevel") });
  if (els.activityBody) els.activityBody.innerHTML = `
    <div class="empty-state">
      <img src="/assets/mission-console.svg" alt="" />
      <p>${t("selectLessonPrompt")}</p>
    </div>`;
}

function setData(nextData) {
  const previousPathId = state.data?.profile?.activePathId;
  state.data = nextData;
  const pathChanged = previousPathId && previousPathId !== nextData.profile.activePathId;
  if (pathChanged && nextData.profile.onboarded) resetActivityPanel();
  render();
}

/* ── ENERGY SYSTEM ───────────────────────────────────────────────────────── */
const ENERGY_MAX       = 20;
const ENERGY_KEY       = "cybersafe_energy";
const ENERGY_TS_KEY    = "cybersafe_energy_ts";
const MS_PER_HOUR      = 3600000;

function energyLoad() {
  const saved = localStorage.getItem(ENERGY_KEY);
  const ts    = localStorage.getItem(ENERGY_TS_KEY);
  state.energy = saved !== null ? Math.min(parseInt(saved, 10), ENERGY_MAX) : ENERGY_MAX;
  // Restore 1 energy per elapsed hour since last save, keeping the real-time reference
  if (ts) {
    const tsNum = parseInt(ts, 10);
    const hoursElapsed = Math.floor((Date.now() - tsNum) / MS_PER_HOUR);
    if (hoursElapsed > 0) {
      state.energy = Math.min(state.energy + hoursElapsed, ENERGY_MAX);
      // Advance the stored timestamp by exactly the hours we consumed,
      // so the remaining partial-hour countdown stays accurate across refreshes.
      const newTs = tsNum + hoursElapsed * MS_PER_HOUR;
      localStorage.setItem(ENERGY_KEY, String(state.energy));
      localStorage.setItem(ENERGY_TS_KEY, String(newTs));
    }
    // If no hours elapsed, do NOT touch the timestamp — preserve real countdown.
  } else {
    // First ever run: initialise timestamp now.
    localStorage.setItem(ENERGY_KEY, String(state.energy));
    localStorage.setItem(ENERGY_TS_KEY, String(Date.now()));
  }
}

function energySave() {
  localStorage.setItem(ENERGY_KEY, String(state.energy));
  // Only write a fresh timestamp when energy changes (deduct / reward).
  // energyLoad must NOT call energySave to avoid resetting the countdown.
  localStorage.setItem(ENERGY_TS_KEY, String(Date.now()));
}

function energyDeduct() {
  if (state.energy > 0) {
    state.energy--;
    energySave();
    renderEnergy();
  }
}

function energyReward(amount) {
  const gained = Math.min(amount, ENERGY_MAX - state.energy);
  if (gained <= 0) return;
  state.energy = Math.min(state.energy + gained, ENERGY_MAX);
  energySave();
  showEnergyBurst(gained);
  renderEnergy();
}

function renderOutOfEnergyState() {
  els.activityBody.innerHTML = `
    <div class="energy-empty-state">
      <div class="energy-empty-icon">🛡️</div>
      <h3>${t("noEnergyTitle")}</h3>
      <p>${t("noEnergyMessage")}</p>
      <div class="energy-restore-hint">
        <svg viewBox="0 0 64 64" width="20" height="20"><path class="shield-body" d="M32 4L6 14v16c0 17 11.5 29.5 26 34 14.5-4.5 26-17 26-34V14L32 4Z"/><path class="shield-bolt" d="M34 18l-9 14h9l-2 14 11-16h-10z"/></svg>
        ${t("energyRestoresHourly")}
      </div>
    </div>`;
}

function renderEnergy() {
  const el = document.getElementById("energyValue");
  if (!el) return;
  el.textContent = state.energy;
  const pill = document.getElementById("energyPill");
  if (!pill) return;
  // Colour feedback: green → yellow → red
  pill.classList.remove("energy-low", "energy-critical", "energy-full");
  if (state.energy <= 4)       pill.classList.add("energy-critical");
  else if (state.energy <= 10) pill.classList.add("energy-low");
  else if (state.energy === ENERGY_MAX) pill.classList.add("energy-full");
  // pulse animation
  el.classList.remove("stat-pulse"); void el.offsetWidth; el.classList.add("stat-pulse");
}

/* Energy burst animation — shown on streak bonus ──────────────────────────── */
function showEnergyBurst(amount) {
  const overlay = document.createElement("div");
  overlay.className = "energy-burst-overlay";
  overlay.innerHTML = `
    <div class="energy-burst-card">
      <div class="burst-shield">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <path class="shield-body" d="M32 4L6 14v16c0 17 11.5 29.5 26 34 14.5-4.5 26-17 26-34V14L32 4Z"/>
          <path class="shield-bolt" d="M34 18l-9 14h9l-2 14 11-16h-10z"/>
        </svg>
      </div>
      <div class="burst-label">5 Correct in a Row!</div>
      <div class="burst-amount">+${amount} Energy</div>
      <div class="burst-sparks">
        ${Array.from({length:8}, (_,i) => `<span class="spark" style="--i:${i}"></span>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
  setTimeout(() => overlay.remove(), 2400);
}

/* Energy timer tooltip ─────────────────────────────────────────────────────── */
function showEnergyTimer() {
  document.querySelector(".energy-timer-popup")?.remove();
  const ts = parseInt(localStorage.getItem(ENERGY_TS_KEY) || "0", 10);
  const nextRestore = ts + MS_PER_HOUR;
  const msLeft = Math.max(nextRestore - Date.now(), 0);
  const mins   = Math.floor(msLeft / 60000);
  const secs   = Math.floor((msLeft % 60000) / 1000);

  const popup = document.createElement("div");
  popup.className = "energy-timer-popup";

  if (state.energy >= ENERGY_MAX) {
    popup.innerHTML = `
      <svg viewBox="0 0 64 64"><path class="shield-body" d="M32 4L6 14v16c0 17 11.5 29.5 26 34 14.5-4.5 26-17 26-34V14L32 4Z"/><path class="shield-bolt" d="M34 18l-9 14h9l-2 14 11-16h-10z"/></svg>
      <strong>Energy Full!</strong>
      <span>All ${ENERGY_MAX} shields ready</span>`;
  } else {
    popup.innerHTML = `
      <svg viewBox="0 0 64 64"><path class="shield-body" d="M32 4L6 14v16c0 17 11.5 29.5 26 34 14.5-4.5 26-17 26-34V14L32 4Z"/><path class="shield-bolt" d="M34 18l-9 14h9l-2 14 11-16h-10z"/></svg>
      <strong>Next +1 Energy in</strong>
      <span class="energy-countdown">${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}</span>
      <small>${state.energy} / ${ENERGY_MAX} shields</small>`;
  }

  const pill = document.getElementById("energyPill");
  document.body.appendChild(popup);
  const rect = pill.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + window.scrollY + 8}px`;
  popup.style.left = `${rect.left + rect.width / 2 - popup.offsetWidth / 2}px`;

  // live countdown tick
  const tick = setInterval(() => {
    const remaining = Math.max(parseInt(localStorage.getItem(ENERGY_TS_KEY)||"0",10) + MS_PER_HOUR - Date.now(), 0);
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    const cd = popup.querySelector(".energy-countdown");
    if (cd) cd.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    if (remaining === 0) clearInterval(tick);
  }, 1000);

  const close = (e) => {
    if (!popup.contains(e.target) && e.target !== pill) {
      clearInterval(tick);
      popup.remove();
      document.removeEventListener("click", close);
    }
  };
  setTimeout(() => document.addEventListener("click", close), 50);
}

/* Hourly restore ticker — fires at the real wall-clock restore moment ─────── */
function startEnergyRestoreTicker() {
  clearInterval(state.energyRestoreTimer);
  if (state.energy >= ENERGY_MAX) return; // nothing to restore

  const ts = parseInt(localStorage.getItem(ENERGY_TS_KEY) || String(Date.now()), 10);
  const nextRestore = ts + MS_PER_HOUR;
  const msUntilNext = Math.max(nextRestore - Date.now(), 0);

  // Fire exactly when the next restore is due, then repeat every hour.
  state.energyRestoreTimer = setTimeout(() => {
    if (state.energy < ENERGY_MAX) {
      state.energy = Math.min(state.energy + 1, ENERGY_MAX);
      energySave();
      renderEnergy();
    }
    // Continue with regular hourly intervals for subsequent restores.
    state.energyRestoreTimer = setInterval(() => {
      if (state.energy < ENERGY_MAX) {
        state.energy = Math.min(state.energy + 1, ENERGY_MAX);
        energySave();
        renderEnergy();
      } else {
        clearInterval(state.energyRestoreTimer);
      }
    }, MS_PER_HOUR);
  }, msUntilNext);
}

/* ── XP POPUP ────────────────────────────────────────────────────────────── */
function showXpGain(amount, anchorEl) {
  if (amount <= 0) return;
  const popup = document.createElement("div");
  popup.className = "xp-pop";
  popup.textContent = `+${amount} XP`;
  const rect = (anchorEl || document.body).getBoundingClientRect();
  popup.style.left = `${rect.left + rect.width/2 - 30}px`;
  popup.style.top  = `${rect.top + window.scrollY - 10}px`;
  document.body.appendChild(popup);
  popup.addEventListener("animationend", () => popup.remove());
}

function animateStatChange(el) {
  el.classList.remove("stat-pulse"); void el.offsetWidth; el.classList.add("stat-pulse");
}

/* ── COACH MESSAGE ───────────────────────────────────────────────────────── */
function coachMessage() {
  if (!state.data) return t("loadingTrainingPlan");
  const { stats, activePath, progress } = state.data;
  if (stats.isComplete) return t("allCompleteCertReady");
  const nextLesson = state.data.curriculum.find(l => l.id === progress.currentLessonId);
  if (!nextLesson) return t("pathReady", { path: pathText(activePath, "label") });
  const nextLevel = nextLesson.levels.find(lv => lv.id === progress.currentLevelId);
  const nextSection = nextLevel?.sections.find(section => section.id === progress.currentSectionId);
  const label = [nextLevel ? levelTitle(nextLevel.number) : progress.currentLevelId.replace("-"," "),
    nextSection ? sectionTitle(nextSection.number) : progress.currentSectionId?.replace("-"," ")].filter(Boolean).join(" / ");
  return t("nextMission", { lesson: c(nextLesson.title), level: label });
}

/* ── RENDER: HEADER ──────────────────────────────────────────────────────── */
function renderHeader() {
  const { profile, activePath, stats } = state.data;
  applyPathTheme(activePath.id);
  applyStaticTranslations();
  const copy = mapCopy(activePath.id);
  els.activePathLabel.textContent = copy.kicker;
  els.pathTitle.textContent = copy.title;
  els.profileButtonName.textContent = profile.name || t("profile");
  paintAvatar(els.miniAvatar, profile);
  if (state.lastXp && profile.xp > state.lastXp) {
    showXpGain(profile.xp - state.lastXp, els.xpValue);
    animateStatChange(els.xpValue);
    animateStatChange(els.streakValue);
  }
  state.lastXp = profile.xp;
  els.streakValue.textContent = profile.streak;
  els.xpValue.textContent = profile.xp;
  els.progressTitle.textContent = t("completeLevels", { completed: stats.completedSections, total: stats.totalSections });
  els.progressMeter.style.width = `${stats.levelPercent}%`;
  els.simulationTitle.textContent = t("simulationCount", { completed: stats.completedSimulations, total: stats.scenarioTarget });
  els.coachLine.textContent = coachMessage();
}

/* ── RENDER: PATH MAP ────────────────────────────────────────────────────── */
function renderLegacyPathMap() {
  const { curriculum } = state.data;
  queueTranslation(curriculum.flatMap(l => [l.title, l.summary]));

  els.pathMap.innerHTML = curriculum.map(lesson => {
    const completeLevels = lesson.levels.filter(lv => lv.completed).length;
    const completeSections = lesson.levels.reduce((sum, lv) => sum + lv.completedSections, 0);
    const totalSections = lesson.levels.reduce((sum, lv) => sum + lv.totalSections, 0);
    const sectionPercent = totalSections ? Math.round((completeSections / totalSections) * 100) : 0;
    const available = lesson.levels.some(lv => lv.unlocked);
    const isSelected = state.selected?.lessonId === lesson.id;
    return `
      <article class="lesson-row">
        <div class="lesson-node ${!available ? "locked" : isSelected ? "current" : ""}">
          ${lesson.number}
        </div>
        <div class="lesson-card ${available ? "clickable" : ""}" data-select-lesson="${lesson.id}">
          <span class="eyebrow">${t("lessonNumber", { number: lesson.number })}</span>
          <h3>${c(lesson.title)}</h3>
          <p>${c(lesson.summary)}</p>
          <div class="lesson-progress" aria-hidden="true"><span style="width:${sectionPercent}%"></span></div>
          <span class="eyebrow">${t("levelCount", { completed: completeLevels, total: lesson.levels.length })} · ${t("sectionCount", { completed: completeSections, total: totalSections })} · ${t("simShort", { completed: lesson.simulationsCompleted, total: lesson.scenarioCount })}</span>
        </div>
      </article>`;
  }).join("");

  els.pathMap.querySelectorAll("[data-select-lesson]").forEach(card => {
    card.addEventListener("click", () => {
      const lesson = findLesson(card.dataset.selectLesson);
      if (!lesson || !lesson.levels.some(lv => lv.unlocked)) return;
      selectLesson(card.dataset.selectLesson);
    });
  });
}

/* ── RENDER: LEVEL TABS ──────────────────────────────────────────────────── */
function renderTrailPathMap() {
  const { curriculum, activePath } = state.data;
  const copy = mapCopy(activePath.id);
  queueTranslation(curriculum.flatMap(l => [l.title, l.summary]));

  const completedLessons = curriculum.filter(lesson => lesson.levels.every(lv => lv.completed)).length;

  function renderSectionBead(lesson, level, section) {
    const isActive = state.selected?.lessonId === lesson.id &&
      state.selected?.levelId === level.id &&
      state.selected?.sectionId === section.id &&
      state.selected?.mode === "quiz";
    const sectionClass = section.completed ? "complete" : !section.unlocked ? "locked" : isActive ? "current" : "open";
    const sectionLabel = `${c(lesson.title)} - ${levelTitle(level.number)} - ${sectionTitle(section.number)}`;
    return `
      <button type="button" class="section-bead ${sectionClass}"
        data-map-section="${lesson.id}:${level.id}:${section.id}"
        ${section.unlocked ? "" : "disabled"}
        title="${attr(sectionLabel)}" aria-label="${attr(sectionLabel)}">
      </button>`;
  }

  function renderLevelBranch(lesson, level) {
    const isActive = state.selected?.lessonId === lesson.id &&
      state.selected?.levelId === level.id &&
      state.selected?.mode === "quiz";
    const levelClass = level.completed ? "complete" : !level.unlocked ? "locked" : isActive ? "current" : "open";
    const label = levelTitle(level.number);
    return `
      <div class="level-branch ${levelClass}">
        <button type="button" class="level-branch-main"
          data-map-level="${lesson.id}:${level.id}"
          ${level.unlocked ? "" : "disabled"}
          title="${attr(label)}" aria-label="${attr(label)}">
          <span class="branch-dot">${level.number}</span>
          <span class="branch-text">${label}</span>
          <span class="branch-count">${level.completedSections}/${level.totalSections}</span>
        </button>
        <div class="section-beads" aria-label="${attr(t("sections"))}">
          ${level.sections.map(section => renderSectionBead(lesson, level, section)).join("")}
        </div>
      </div>`;
  }

  const stops = curriculum.map(lesson => {
    const completeLevels = lesson.levels.filter(lv => lv.completed).length;
    const completeSections = lesson.levels.reduce((sum, lv) => sum + lv.completedSections, 0);
    const totalSections = lesson.levels.reduce((sum, lv) => sum + lv.totalSections, 0);
    const sectionPercent = totalSections ? Math.round((completeSections / totalSections) * 100) : 0;
    const available = lesson.levels.some(lv => lv.unlocked);
    const isSelected = state.selected?.lessonId === lesson.id;
    const isComplete = totalSections > 0 && completeSections === totalSections;
    const side = lesson.number % 2 ? "map-left" : "map-right";
    const status = isComplete ? "complete" : !available ? "locked" : isSelected ? "current" : "open";
    const card = `
      <div class="lesson-card ${available ? "clickable" : ""}" ${available ? `data-select-lesson="${lesson.id}"` : ""}>
        <div class="lesson-card-top">
          <span class="eyebrow">${t("lessonNumber", { number: lesson.number })}</span>
          <span class="lesson-percent">${sectionPercent}%</span>
        </div>
        <h3>${c(lesson.title)}</h3>
        <p>${c(lesson.summary)}</p>
        <div class="lesson-progress" aria-hidden="true"><span style="width:${sectionPercent}%"></span></div>
        <div class="lesson-meta-row">
          <span>${t("levelCount", { completed: completeLevels, total: lesson.levels.length })}</span>
          <span>${t("sectionCount", { completed: completeSections, total: totalSections })}</span>
          <span>${t("simShort", { completed: lesson.simulationsCompleted, total: lesson.scenarioCount })}</span>
        </div>
        <div class="lesson-level-tree">
          ${lesson.levels.map(level => renderLevelBranch(lesson, level)).join("")}
        </div>
      </div>`;

    return `
      <article class="lesson-row ${side} ${status}" style="--lesson-accent:${activePath.accent}">
        ${side === "map-left" ? card : `<div class="map-spacer"></div>`}
        <button type="button" class="lesson-node ${status}" ${available ? `data-select-lesson="${lesson.id}"` : "disabled"}
          title="${attr(c(lesson.title))}" aria-label="${attr(c(lesson.title))}">
          ${lesson.number}
        </button>
        ${side === "map-right" ? card : `<div class="map-spacer"></div>`}
      </article>`;
  }).join("");

  els.pathMap.innerHTML = `
    <div class="map-header">
      <div>
        <span class="eyebrow">${copy.kicker}</span>
        <h2>${copy.title}</h2>
        <p>${copy.summary}</p>
      </div>
      <span class="map-count">${completedLessons}/${curriculum.length}</span>
    </div>
    <div class="map-trail">
      ${stops}
    </div>`;

  els.pathMap.querySelectorAll("[data-select-lesson]").forEach(card => {
    card.addEventListener("click", event => {
      if (event.target.closest("[data-map-level], [data-map-section]")) return;
      const lesson = findLesson(card.dataset.selectLesson);
      if (!lesson || !lesson.levels.some(lv => lv.unlocked)) return;
      selectLesson(card.dataset.selectLesson);
    });
  });
  els.pathMap.querySelectorAll("[data-map-level]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const [lessonId, levelId] = btn.dataset.mapLevel.split(":");
      selectLevel(lessonId, levelId);
    });
  });
  els.pathMap.querySelectorAll("[data-map-section]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const [lessonId, levelId, sectionId] = btn.dataset.mapSection.split(":");
      selectLevel(lessonId, levelId, sectionId);
    });
  });
}

function renderPathMap() {
  const { curriculum, activePath, profile, progress } = state.data;
  const copy = mapCopy(activePath.id);
  queueTranslation(curriculum.flatMap(l => [l.title, l.summary]));

  const selectedLesson = curriculum.find(lesson => lesson.id === state.selected?.lessonId);
  const currentLesson = curriculum.find(lesson => lesson.id === progress.currentLessonId);
  const firstOpenLesson = curriculum.find(lesson => lesson.levels.some(level => level.unlocked));
  const expandedLesson = selectedLesson || currentLesson || firstOpenLesson || curriculum[0];

  const iconCheck = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>`;
  const iconLock = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3"/><path d="M6 11h12v9H6z"/></svg>`;
  const iconStar = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>`;
  const iconChevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>`;
  const iconShield = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 54 15v15c0 15-9 24-22 29C19 54 10 45 10 30V15L32 6Z"/><path d="M25 33l5 5 10-13"/></svg>`;

  function lessonStats(lesson) {
    const completeLevels = lesson.levels.filter(level => level.completed).length;
    const completeSections = lesson.levels.reduce((sum, level) => sum + level.completedSections, 0);
    const totalSections = lesson.levels.reduce((sum, level) => sum + level.totalSections, 0);
    const sectionPercent = totalSections ? Math.round((completeSections / totalSections) * 100) : 0;
    const available = lesson.levels.some(level => level.unlocked);
    return {
      available,
      completeLevels,
      completeSections,
      totalSections,
      sectionPercent,
      isComplete: totalSections > 0 && completeSections === totalSections
    };
  }

  function sectionState(section) {
    if (section.completed) return "complete";
    if (!section.unlocked) return "locked";
    return "open";
  }

  function renderSectionItem(lesson, level, section) {
    const active = state.selected?.lessonId === lesson.id &&
      state.selected?.levelId === level.id &&
      state.selected?.sectionId === section.id &&
      state.selected?.mode === "quiz";
    const status = active ? "current" : sectionState(section);
    const checkpoint = `${level.number}.${section.number}`;
    const label = `${checkpoint} ${sectionLearningTitle(lesson.title, level.number, section.number)}`;
    return `
      <button type="button" class="section-item ${status}"
        data-map-section="${lesson.id}:${level.id}:${section.id}"
        ${section.unlocked ? "" : "disabled"}
        aria-label="${attr(label)}" title="${attr(label)}">
        <span class="checkpoint-badge">
          ${section.completed ? iconCheck : !section.unlocked ? iconLock : checkpoint}
        </span>
        <span class="section-copy">
          <strong>${checkpoint} ${sectionLearningTitle(c(lesson.title), level.number, section.number)}</strong>
          <small>${sectionLearningDescription(section.number)}</small>
        </span>
        <span class="section-reward ${section.completed ? "earned" : ""}">${section.completed ? iconStar : section.unlocked ? iconStar : iconLock}</span>
      </button>`;
  }

  function renderLevel(lesson, level) {
    const active = state.selected?.lessonId === lesson.id &&
      state.selected?.levelId === level.id &&
      state.selected?.mode === "quiz";
    const status = level.completed ? "complete" : !level.unlocked ? "locked" : active ? "current" : "open";
    const showSections = level.unlocked || level.completed || active;
    return `
      <article class="level-accordion ${status}">
        <button type="button" class="level-accordion-head"
          data-map-level="${lesson.id}:${level.id}"
          ${level.unlocked ? "" : "disabled"}
          aria-label="${attr(levelFocusTitle(lesson.title, level.number))}">
          <span class="level-pill">${t("level")} ${level.number}</span>
          <span class="level-title-block">
            <strong>${levelFocusTitle(c(lesson.title), level.number)}</strong>
            <small>${levelFocusDescription(level.number)}</small>
          </span>
          <span class="level-score">${level.completedSections}/${level.totalSections}</span>
          <span class="level-state">${level.completed ? iconStar : !level.unlocked ? iconLock : iconChevron}</span>
        </button>
        ${showSections ? `
          <div class="section-list">
            ${level.sections.map(section => renderSectionItem(lesson, level, section)).join("")}
          </div>` : ""}
      </article>`;
  }

  function renderLessonSummary(lesson) {
    const stats = lessonStats(lesson);
    const status = stats.isComplete ? "complete" : !stats.available ? "locked" : "open";
    return `
      <button type="button" class="lesson-summary-card ${status}"
        data-select-lesson="${lesson.id}"
        ${stats.available ? "" : "disabled"}
        aria-label="${attr(c(lesson.title))}">
        <span class="summary-icon">${lesson.number}</span>
        <span class="summary-copy">
          <small>${t("lessonNumber", { number: lesson.number })}</small>
          <strong>${c(lesson.title)}</strong>
          <em>${c(lesson.summary)}</em>
        </span>
        <span class="summary-progress">
          <strong>${stats.sectionPercent}%</strong>
          <span><i style="width:${stats.sectionPercent}%"></i></span>
        </span>
        <span class="summary-arrow">${stats.available ? iconChevron : iconLock}</span>
      </button>`;
  }

  const expandedStats = lessonStats(expandedLesson);
  const expandedLevels = expandedLesson.levels.map(level => renderLevel(expandedLesson, level)).join("");
  const lessonCards = curriculum
    .filter(lesson => lesson.id !== expandedLesson.id)
    .map(renderLessonSummary)
    .join("");

  els.pathMap.innerHTML = `
    <section class="course-dashboard" style="--lesson-accent:${activePath.accent}">
      <div class="course-header">
        <div>
          <span class="eyebrow">${pathText(activePath, "title")} - ${pathText(activePath, "label")}</span>
          <h2>${copy.title}</h2>
          <p>${copy.summary}</p>
        </div>
        <div class="learner-card">
          <span class="course-avatar">${initials(profile.name)}</span>
          <span>
            <strong>${profile.name || t("profile")}</strong>
            <small>${pathText(activePath, "audience")}</small>
          </span>
          <b>${profile.xp} XP</b>
        </div>
      </div>

      <article class="module-hero">
        <span class="module-badge">${iconShield}</span>
        <div class="module-copy">
          <span class="eyebrow">${t("lessonNumber", { number: expandedLesson.number })}</span>
          <h3>${c(expandedLesson.title)}</h3>
          <p>${c(expandedLesson.summary)}</p>
          <div class="module-actions">
            <button type="button" class="primary-button" data-start-lesson="${expandedLesson.id}">${t("startLevel")}</button>
            <button type="button" class="secondary-button" data-start-simulation="${expandedLesson.id}">${t("simulation")}</button>
          </div>
        </div>
        <div class="lesson-art" aria-label="${attr(lessonArtLabel(activePath.id))}">
          <span class="art-tree one"></span>
          <span class="art-tree two"></span>
          <span class="art-house"><i></i></span>
          <span class="art-path"></span>
          <span class="art-shield">${iconShield}</span>
        </div>
        <div class="module-progress">
          <strong>${expandedStats.sectionPercent}%</strong>
          <span>${t("complete")}</span>
          <div><i style="width:${expandedStats.sectionPercent}%"></i></div>
        </div>
      </article>

      <div class="expanded-lesson">
        ${expandedLevels}
      </div>

      <div class="lesson-summary-list">
        ${lessonCards}
      </div>
    </section>`;

  els.pathMap.querySelectorAll("[data-select-lesson]").forEach(card => {
    card.addEventListener("click", () => {
      const lesson = findLesson(card.dataset.selectLesson);
      if (!lesson || !lesson.levels.some(level => level.unlocked)) return;
      selectLesson(card.dataset.selectLesson);
    });
  });
  els.pathMap.querySelectorAll("[data-map-level]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const [lessonId, levelId] = btn.dataset.mapLevel.split(":");
      selectLevel(lessonId, levelId);
    });
  });
  els.pathMap.querySelectorAll("[data-map-section]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const [lessonId, levelId, sectionId] = btn.dataset.mapSection.split(":");
      selectLevel(lessonId, levelId, sectionId);
    });
  });
  els.pathMap.querySelectorAll("[data-start-lesson]").forEach(btn => {
    btn.addEventListener("click", () => selectLesson(btn.dataset.startLesson));
  });
  els.pathMap.querySelectorAll("[data-start-simulation]").forEach(btn => {
    btn.addEventListener("click", () => selectSimulation(btn.dataset.startSimulation));
  });
}

function renderLevelTabs(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) { els.levelTabs.innerHTML = ""; return; }
  const iconSimulation = `<svg class="level-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v10H5z"/><path d="M8 10h2M9 9v2M14 12h.01M17 12h.01"/><path d="M9 17l-2 3M15 17l2 3"/></svg>`;
  const hasUnlockedLevel = lesson.levels.some(lv => lv.unlocked);
  const selectedLevel = lesson.levels.find(lv => lv.id === state.selected?.levelId) ||
    lesson.levels.find(lv => lv.unlocked) ||
    lesson.levels[0];
  const levelButtons = lesson.levels.map(lv => `
      <button class="level-tab ${lv.completed ? "complete" : ""} ${!lv.unlocked ? "locked" : ""} ${state.selected?.levelId === lv.id && state.selected?.mode === "quiz" ? "active" : ""}"
        data-level-tab="${lv.id}" ${lv.unlocked ? "" : "disabled"} title="${levelTitle(lv.number)}">
        ${lv.number}
      </button>`).join("");
  const sectionButtons = state.selected?.mode === "quiz" && selectedLevel ? `
    <div class="section-tabs" aria-label="Sections">
      ${selectedLevel.sections.map(section => `
        <button class="section-tab ${section.completed ? "complete" : ""} ${!section.unlocked ? "locked" : ""} ${state.selected?.sectionId === section.id ? "active" : ""}"
          data-section-tab="${section.id}" data-section-level="${selectedLevel.id}" ${section.unlocked ? "" : "disabled"} title="${sectionTitle(section.number)}">
          ${section.number}
        </button>`).join("")}
    </div>` : "";

  els.levelTabs.innerHTML = `
    <div class="level-tab-row">
      ${levelButtons}
      <button class="level-tab sim-tab ${!hasUnlockedLevel ? "locked" : ""} ${state.selected?.mode === "simulation" ? "active" : ""}"
        data-sim-tab="${lessonId}" ${hasUnlockedLevel ? "" : "disabled"}
        title="${t("simulation")}" aria-label="${t("simulation")}">
        ${iconSimulation}
      </button>
    </div>
    ${sectionButtons}`;

  els.levelTabs.querySelectorAll("[data-level-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lv = lesson.levels.find(l => l.id === btn.dataset.levelTab);
      if (lv) selectLevel(lessonId, lv.id);
    });
  });
  els.levelTabs.querySelectorAll("[data-section-tab]").forEach(btn => {
    btn.addEventListener("click", () => selectLevel(lessonId, btn.dataset.sectionLevel, btn.dataset.sectionTab));
  });
  els.levelTabs.querySelectorAll("[data-sim-tab]").forEach(btn => {
    btn.addEventListener("click", () => selectSimulation(btn.dataset.simTab));
  });
  return;

  els.levelTabs.innerHTML = lesson.levels.map(lv => `
    <button class="level-tab ${lv.completed ? "complete" : ""} ${!lv.unlocked ? "locked" : ""} ${state.selected?.levelId === lv.id && state.selected?.mode === "quiz" ? "active" : ""}"
      data-level-tab="${lv.id}" ${lv.unlocked ? "" : "disabled"}>
      ${lv.number}
    </button>`).join("") + `
    <button class="level-tab sim-tab ${!lesson.levels.some(lv => lv.unlocked) ? "locked" : ""} ${state.selected?.mode === "simulation" ? "active" : ""}"
      data-sim-tab="${lessonId}" ${lesson.levels.some(lv => lv.unlocked) ? "" : "disabled"}>
      🎭
    </button>`;

  els.levelTabs.querySelectorAll("[data-level-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lv = lesson.levels.find(l => l.id === btn.dataset.levelTab);
      if (lv) selectLevel(lessonId, lv.id);
    });
  });
  els.levelTabs.querySelectorAll("[data-sim-tab]").forEach(btn => {
    btn.addEventListener("click", () => selectSimulation(btn.dataset.simTab));
  });
}

/* ── FIND HELPERS ────────────────────────────────────────────────────────── */
function findLesson(id) { return state.data.curriculum.find(l => l.id === id); }
function findLevel(lesson, id) { return lesson?.levels.find(lv => lv.id === id); }
function findSection(level, id) { return level?.sections.find(section => section.id === id); }

function updateActivityHead({ eyebrow, title }) {
  els.activityEyebrow.textContent = eyebrow;
  els.activityTitle.textContent = title;
}

/* ── SELECT LESSON ───────────────────────────────────────────────────────── */
function selectLesson(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return;
  const firstActiveLevel = lesson.levels.find(lv => lv.unlocked && !lv.completed) ||
                           lesson.levels.filter(lv => lv.unlocked).pop();
  const firstActiveSection = firstActiveLevel?.sections.find(section => section.unlocked && !section.completed) ||
                             firstActiveLevel?.sections.filter(section => section.unlocked).pop();
  if (firstActiveLevel && firstActiveSection) selectLevel(lessonId, firstActiveLevel.id, firstActiveSection.id);
}

/* ── SELECT LEVEL ────────────────────────────────────────────────────────── */
function selectLevel(lessonId, levelId, sectionId = null) {
  const lesson = findLesson(lessonId);
  const level = findLevel(lesson, levelId);
  const section = findSection(level, sectionId) ||
    level?.sections.find(item => item.unlocked && !item.completed) ||
    level?.sections.filter(item => item.unlocked).pop();
  if (!lesson || !level || !section) return;
  state.selected = { lessonId, levelId, sectionId: section.id, mode: "quiz" };
  state.session = null;
  state.quizIndex = 0;
  state.answers = [];
  state.finalAnswers = [];
  state.retryQueue = [];
  state.answerFeedback = null;
  updateActivityHead({ eyebrow: c(lesson.title), title: `${levelTitle(level.number)} - ${sectionTitle(section.number)}` });
  renderLevelTabs(lessonId);
  showActivityPage();
  els.activityBody.innerHTML = `
    <div class="quiz-card">
      <p>${c(lesson.summary)}</p>
      <button class="primary-button" id="startQuiz">${t("startLevel")} 🚀</button>
    </div>`;
  document.querySelector("#startQuiz").addEventListener("click", startQuiz);
  renderPathMap();
}

/* ── LOW ENERGY WARNING POPUP ─────────────────────────────────────────────── */
function showLowEnergyWarning(questionCount, onContinue) {
  // Remove any existing popup
  document.querySelector(".low-energy-warning-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "low-energy-warning-overlay";
  overlay.innerHTML = `
    <div class="low-energy-warning-card">
      <div class="lew-icon">⚡🛡️</div>
      <h3 class="lew-title">Low Energy Warning</h3>
      <p class="lew-body">
        You only have <strong>${state.energy} shield${state.energy !== 1 ? "s" : ""}</strong> but this section has
        <strong>${questionCount} question${questionCount !== 1 ? "s" : ""}</strong>.
        You may run out of energy before finishing!
      </p>
      <p class="lew-sub">Energy restores +1 per hour automatically.</p>
      <div class="lew-actions">
        <button class="lew-continue-btn primary-button" id="lewContinue">Continue Anyway 🚀</button>
        <button class="lew-cancel-btn secondary-button" id="lewCancel">Wait for Energy</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("lewContinue").addEventListener("click", () => {
    overlay.remove();
    onContinue();
  });
  document.getElementById("lewCancel").addEventListener("click", () => {
    overlay.remove();
  });
  // Click outside to cancel
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/* ── START QUIZ ──────────────────────────────────────────────────────────── */
async function startQuiz() {
  // Block if energy is zero
  if (state.energy <= 0) {
    renderOutOfEnergyState();
    return;
  }

  // Warn if energy is less than the number of questions in this section
  const questionsPerSection = state.data?.activePath?.questionsPerSection ?? 10;
  if (state.energy < questionsPerSection) {
    showLowEnergyWarning(questionsPerSection, doStartQuiz);
    return;
  }

  await doStartQuiz();
}

async function doStartQuiz() {
  const { lessonId, levelId, sectionId } = state.selected;
  const pathId = state.data.profile.activePathId;

  try {
    els.activityBody.innerHTML = `<div class="empty-state"><p>${t("loading")}</p></div>`;
    state.session = await api(`/api/session?pathId=${pathId}&lessonId=${lessonId}&levelId=${levelId}&sectionId=${sectionId}`);
  } catch (err) {
    els.activityBody.innerHTML = `<div class="result-card"><h3>${t("appCouldNotStart")}</h3><p>${err.message}</p></div>`;
    return;
  }
  state.quizIndex = 0;
  state.session.questions = state.session.questions.map((question, index) => ({
    ...question,
    originalIndex: index,
    retry: false,
    retryCount: 0
  }));
  state.answers = Array(state.session.questions.length).fill(null);
  state.finalAnswers = Array(state.session.questions.length).fill(null);
  state.retryQueue = [];
  state.answerFeedback = null;
  state.sectionStartTs = Date.now();
  state.sectionStartXp = state.data.profile.xp || 0;

  const lang = currentLanguage();
  if (lang !== "English") {
    const allText = [...new Set(state.session.questions.flatMap(q =>
      [q.prompt, ...q.options, q.topic, q.explanation].filter(Boolean)
    ))];
    await translateBatch(allText, lang);
    state.session.questions = state.session.questions.map(q => ({
      ...q,
      prompt:      window.I18N.contentText(lang, q.prompt),
      options:     q.options.map(o => window.I18N.contentText(lang, o)),
      topic:       window.I18N.contentText(lang, q.topic),
      explanation: window.I18N.contentText(lang, q.explanation)
    }));
  }
  renderQuestion();
}

function originalQuestionIndex(question) {
  return Number.isInteger(question?.originalIndex) ? question.originalIndex : state.quizIndex;
}

function queueRetryQuestion(question) {
  const originalIndex = originalQuestionIndex(question);
  const alreadyQueued = state.retryQueue.some(item => item.originalIndex === originalIndex);
  const alreadyScheduled = state.session.questions
    .slice(state.quizIndex + 1)
    .some(item => item.retry && item.originalIndex === originalIndex);
  if (alreadyQueued || alreadyScheduled) return;

  state.retryQueue.push({
    ...question,
    originalIndex,
    retry: true,
    retryCount: (question.retryCount || 0) + 1
  });
}

function appendRetryQuestion() {
  const retry = state.retryQueue.shift();
  if (!retry) return false;

  state.session.questions.push({
    ...retry,
    id: `${retry.id || `q-${retry.originalIndex + 1}`}-retry-${retry.retryCount || 1}`,
    retry: true
  });
  state.answers.push(null);
  return true;
}

function recordQuizAnswer(optionIndex) {
  if (state.energy <= 0) {
    renderOutOfEnergyState();
    return;
  }
  const question = state.session.questions[state.quizIndex];
  const correct = optionIndex === question.answer;
  const originalIndex = originalQuestionIndex(question);

  state.answers[state.quizIndex] = optionIndex;
  state.finalAnswers[originalIndex] = optionIndex;
  if (!correct) queueRetryQuestion(question);

  // ── Energy: spend 1 per question; reward streak on correct ──────────────
  energyDeduct();
  if (correct) {
    state.correctStreak++;
    if (state.correctStreak > 0 && state.correctStreak % 5 === 0) {
      const bonus = Math.floor(Math.random() * 5) + 1; // 1–5
      energyReward(bonus);
    }
  }
  if (!correct) state.correctStreak = 0;

  if (state.energy <= 0) {
    renderOutOfEnergyState();
    return;
  }

  state.answerFeedback = {
    questionIndex: state.quizIndex,
    correct,
    message: correct ? t("correctAnswerFeedback") : t("wrongAnswerFeedback")
  };
  renderQuestion();
}

async function advanceQuestion() {
  if (state.energy <= 0) {
    renderOutOfEnergyState();
    return;
  }
  const total = state.session.questions.length;
  state.answerFeedback = null;

  if (state.quizIndex === total - 1) {
    if (appendRetryQuestion()) {
      state.quizIndex++;
      renderQuestion();
      return;
    }
    await finishQuiz();
    return;
  }

  state.quizIndex++;
  renderQuestion();
}

/* ── RENDER QUESTION ─────────────────────────────────────────────────────── */
function renderQuestion() {
  if (state.energy <= 0) {
    renderOutOfEnergyState();
    return;
  }
  const question = state.session.questions[state.quizIndex];
  const total    = state.session.questions.length;
  const selected = state.answers[state.quizIndex];
  const feedback = state.answerFeedback?.questionIndex === state.quizIndex ? state.answerFeedback : null;
  const pct      = Math.round(((state.quizIndex) / total) * 100);
  updateActivityHead({ eyebrow: question.topic, title: t("decisionCheck") });
  renderLevelTabs(state.selected.lessonId);

  const LABELS = ["A", "B", "C", "D"];

  els.activityBody.innerHTML = `
    <div class="quiz-card mcq-immersive">

      <!-- ── TOP META BAR ── -->
      <div class="mcq-meta-bar">
        <div class="mcq-topic-chip">
          <span class="mcq-topic-dot"></span>
          <span>${question.topic}</span>
        </div>
        <div class="mcq-progress-info">
          <span class="mcq-q-counter">${state.quizIndex + 1}<span class="mcq-q-total"> / ${total}</span></span>
          ${question.retry ? `<span class="mcq-retry-badge">↩ Retry</span>` : ""}
        </div>
      </div>

      <!-- ── PROGRESS TRACK ── -->
      <div class="mcq-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="mcq-track-fill" style="width:${pct}%"></div>
        ${Array.from({length: total}, (_,i) => `<div class="mcq-track-dot ${i < state.quizIndex ? 'done' : i === state.quizIndex ? 'active' : ''}"></div>`).join("")}
      </div>

      <!-- ── QUESTION BUBBLE ── -->
      <div class="mcq-question-wrap">
        <div class="mcq-question-icon" aria-hidden="true">?</div>
        <div class="question-prompt mcq-prompt">${question.prompt}</div>
      </div>

      <!-- ── OPTIONS GRID ── -->
      <div class="option-grid mcq-option-grid">
        ${question.options.map((opt, i) => {
          let state_cls = "";
          if (selected === i) state_cls = feedback?.correct ? "correct" : feedback ? "wrong" : "selected";
          return `
          <button class="option-button mcq-option ${state_cls}" data-option="${i}" ${selected !== null ? "disabled" : ""}>
            <span class="mcq-label">${LABELS[i]}</span>
            <span class="mcq-option-text">${opt}</span>
            ${selected === i && feedback?.correct ? `<span class="mcq-check">✓</span>` : ""}
            ${selected === i && feedback && !feedback.correct ? `<span class="mcq-check">✗</span>` : ""}
          </button>`;
        }).join("")}
      </div>

      <!-- ── FEEDBACK BANNER ── -->
      ${feedback ? `
        <div class="answer-feedback mcq-feedback ${feedback.correct ? "correct" : "wrong"}" role="status">
          <span class="fb-icon">${feedback.correct ? "🛡️" : "⚠️"}</span>
          <span>${feedback.message}</span>
        </div>` : ""}

      <!-- ── NAVIGATION ── -->
      <div class="quiz-actions mcq-actions">
        <button class="secondary-button mcq-nav-btn" id="prevQuestion" ${state.quizIndex === 0 ? "disabled" : ""}>
          ← ${t("back")}
        </button>
        <div class="mcq-energy-hint">
          <svg viewBox="0 0 64 64" width="16" height="16"><path class="shield-body" d="M32 4L6 14v16c0 17 11.5 29.5 26 34 14.5-4.5 26-17 26-34V14L32 4Z"/><path class="shield-bolt" d="M34 18l-9 14h9l-2 14 11-16h-10z"/></svg>
          <span id="energyHintVal">${state.energy}</span>
        </div>
        <button class="primary-button mcq-nav-btn" id="nextQuestion" ${selected === null ? "disabled" : ""}>
          ${state.quizIndex === total - 1 && !state.retryQueue.length ? t("finish") + " ✅" : t("next") + " →"}
        </button>
      </div>
    </div>`;

  els.activityBody.querySelectorAll("[data-option]").forEach(btn => {
    btn.addEventListener("click", () => {
      recordQuizAnswer(Number(btn.dataset.option));
    });
  });
  document.querySelector("#prevQuestion").addEventListener("click", () => {
    state.answerFeedback = null;
    state.quizIndex--;
    renderQuestion();
  });
  document.querySelector("#nextQuestion").addEventListener("click", advanceQuestion);
}

/* ── FINISH QUIZ ─────────────────────────────────────────────────────────── */
async function finishQuiz() {
  const result = await api("/api/session/complete", {
    method: "POST",
    body: JSON.stringify({ sessionId: state.session.id, answers: state.finalAnswers.length ? state.finalAnswers : state.answers })
  });
  state.data.profile   = result.profile;
  state.data.progress  = result.progress;
  state.data.stats     = result.stats;
  state.data.curriculum = result.curriculum;
  await renderResult(result);
  renderHeader();
  renderPathMap();
}

/* ── RENDER RESULT ───────────────────────────────────────────────────────── */
async function renderResult(result) {
  const pct  = Math.round(result.accuracy * 100);
  const lang = currentLanguage();
  const elapsedMs = state.sectionStartTs ? Math.max(0, Date.now() - state.sectionStartTs) : 0;
  const elapsedMins = Math.floor(elapsedMs / 60000);
  const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
  const xpEarned = Math.max(0, (result.profile?.xp || 0) - (state.sectionStartXp || 0));
  if (lang !== "English") {
    const expTexts = [...new Set(result.explanations.flatMap(e => [e.correctAnswer, e.explanation].filter(Boolean)))];
    await translateBatch(expTexts, lang);
    result.explanations = result.explanations.map(e => ({
      ...e,
      correctAnswer: window.I18N.contentText(lang, e.correctAnswer),
      explanation:   window.I18N.contentText(lang, e.explanation)
    }));
  }
  updateActivityHead({
    eyebrow: result.passed ? t("levelComplete") : t("practiceAgain"),
    title:   result.passed ? t("strongDefense") : t("almostThere")
  });
  renderLevelTabs(state.selected.lessonId);

  els.activityBody.innerHTML = `
    <div class="result-card">
      <div class="result-score">
        <div class="score-ring" style="--score:${pct}%">${pct}%</div>
        <div>
          <h3>${result.passed ? t("unlockedProgress") : t("reviewRetry")}</h3>
          <p>${result.passed ? t("nextLevelAvailable") : t("scoreToUnlock")}</p>
        </div>
      </div>
      <div class="result-meta">
        <div><strong>${t("timeTaken") || "Time"}:</strong> ${String(elapsedMins).padStart(2,"0")}:${String(elapsedSecs).padStart(2,"0")}</div>
        <div><strong>${t("xpEarned") || "XP Earned"}:</strong> +${xpEarned}</div>
      </div>
      <div class="explanation-list">
        ${result.explanations.map(item => `
          <div class="explanation-item">
            <strong>${item.correctAnswer}</strong>
            <span>${item.explanation}</span>
          </div>`).join("")}
      </div>
      <div class="quiz-actions">
        <button class="primary-button" id="continuePath">${t("continue")} →</button>
        <button class="secondary-button" id="retryLevel">🔄 ${t("retry")}</button>
      </div>
    </div>`;

  document.querySelector("#continuePath").addEventListener("click", selectCurrentProgress);
  document.querySelector("#retryLevel").addEventListener("click", startQuiz);
}

/* ── SELECT CURRENT PROGRESS ─────────────────────────────────────────────── */
function selectCurrentProgress() {
  const progress = state.data.progress;
  const lesson = findLesson(progress.currentLessonId);
  const level  = findLevel(lesson, progress.currentLevelId);
  const section = findSection(level, progress.currentSectionId);
  if (lesson && level?.unlocked && section?.unlocked) {
    selectLevel(progress.currentLessonId, progress.currentLevelId, progress.currentSectionId);
    return;
  }
  if (lesson && level?.unlocked) { selectLevel(progress.currentLessonId, progress.currentLevelId); return; }
  showActivityPage();
  els.activityBody.innerHTML = `<div class="result-card"><h3>🎉 ${t("pathComplete")}</h3><p>${t("pathCompleteBody")}</p></div>`;
}

/* ── SELECT SIMULATION ───────────────────────────────────────────────────── */
async function selectSimulation(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return;
  const nextIndex = Math.min(lesson.simulationsCompleted, lesson.scenarioCount - 1);
  const pathId = state.data.profile.activePathId;
  state.selected = { lessonId, mode: "simulation" };
  state.scenarioIndex = nextIndex;
  renderLevelTabs(lessonId);
  showActivityPage();

  els.activityBody.innerHTML = `<div class="empty-state"><p>${t("loading")}</p></div>`;
  try {
    state.simulation = await api(`/api/simulation?pathId=${pathId}&lessonId=${lessonId}&index=${nextIndex}`);
  } catch (err) {
    els.activityBody.innerHTML = `<div class="result-card"><h3>${t("appCouldNotStart")}</h3><p>${err.message}</p></div>`;
    return;
  }

  const lang = currentLanguage();
  if (lang !== "English") {
    const simTexts = [...new Set([
      state.simulation.title, state.simulation.setup,
      ...state.simulation.choices.map(ch => ch.text)
    ].filter(Boolean))];
    await translateBatch(simTexts, lang);
    state.simulation = {
      ...state.simulation,
      title:   window.I18N.contentText(lang, state.simulation.title),
      setup:   window.I18N.contentText(lang, state.simulation.setup),
      choices: state.simulation.choices.map(ch => ({ ...ch, text: window.I18N.contentText(lang, ch.text) }))
    };
  }
  renderSimulation();
  renderPathMap();
}

/* ── RENDER SIMULATION ───────────────────────────────────────────────────── */
function renderSimulation(feedback = null) {
  const lesson = findLesson(state.selected.lessonId);
  updateActivityHead({ eyebrow: t("virtualSimulation"), title: state.simulation.title });

  els.activityBody.innerHTML = `
    <div class="simulation-card">
      <div class="scenario-message">${state.simulation.setup}</div>
      <div class="option-grid">
        ${state.simulation.choices.map(ch => `
          <button class="choice-button" data-choice-id="${ch.id}" ${feedback ? "disabled" : ""}>
            ${ch.text}
          </button>`).join("")}
      </div>
      ${feedback ? `
        <div class="feedback ${feedback.safe ? "safe" : "risky"}">${feedback.feedback}</div>
        <button class="primary-button" id="nextSimulation">${t("continue")} →</button>` : ""}
    </div>`;

  els.activityBody.querySelectorAll("[data-choice-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const result = await api("/api/simulation/respond", {
        method: "POST",
        body: JSON.stringify({
          pathId: state.data.profile.activePathId,
          lessonId: state.selected.lessonId,
          scenarioIndex: state.scenarioIndex,
          choiceId: btn.dataset.choiceId
        })
      });
      state.data.profile    = result.profile;
      state.data.progress   = result.progress;
      state.data.stats      = result.stats;
      state.data.curriculum = result.curriculum;
      const fbLang = currentLanguage();
      if (fbLang !== "English" && result.feedback) {
        await translateBatch([result.feedback], fbLang);
        result.feedback = window.I18N.contentText(fbLang, result.feedback);
      }
      renderHeader();
      renderPathMap();
      renderSimulation(result);
    });
  });

  const nextBtn = document.querySelector("#nextSimulation");
  if (nextBtn) nextBtn.addEventListener("click", () => selectSimulation(state.selected.lessonId));
}

/* ── CERTIFICATE ─────────────────────────────────────────────────────────── */
function openCertificate() {
  const { certificate, stats, profile, activePath } = state.data;
  applyStaticTranslations();
  els.certificateModal.classList.remove("hidden");
  if (certificate) {
    els.certificateText.textContent = t("earnedCert", { name: certificate.learnerName, path: pathText(activePath,"title"), date: new Date(certificate.issuedAt).toLocaleDateString(), id: certificate.id });
    els.issueCertificate.disabled = true; return;
  }
  if (stats.isComplete) {
    els.certificateText.textContent = t("completedPathCert", { name: profile.name, path: pathText(activePath,"title") });
    els.issueCertificate.disabled = false; return;
  }
  els.certificateText.textContent = t("completeAllLevels", { total: stats.totalSections, completed: stats.completedSections, path: pathText(activePath,"title") });
  els.issueCertificate.disabled = true;
}

async function issueCertificate() {
  const result = await api("/api/certificate/issue", { method:"POST", body:JSON.stringify({ pathId: state.data.profile.activePathId }) });
  state.data.certificate = result.certificate;
  openCertificate();
}

/* ── TAB SWITCHING ───────────────────────────────────────────────────────── */
let activeTab = "learn";

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".nav-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => {
    p.classList.toggle("hidden", p.id !== "tab-" + tab);
    p.classList.toggle("active", p.id === "tab-" + tab);
  });
  if (tab === "quests")      renderQuests();
  if (tab === "leaderboard") renderLeaderboard();
  if (tab === "chatbot")     initChatbot();
}

/* ── QUESTS ──────────────────────────────────────────────────────────────── */
async function renderQuests() {
  const panel = document.querySelector("#questsPanel");
  panel.innerHTML = `<div class="empty-state" style="min-height:200px"><p>⚔️ ${t("loadingQuests")}</p></div>`;
  try {
    const { quests } = await api("/api/quests");
    queueTranslation(quests.flatMap(cat => cat.items.flatMap(q => [q.title, q.desc])));
    panel.innerHTML = `
      <div class="quests-header"><h2>⚔️ ${t("quests")}</h2></div>
      ${quests.map(cat => `
        <div class="quest-category">
          <div class="quest-category-title">
            ${ cat.category === "Daily" ? "📅" : cat.category === "Milestone" ? "🏅" : "🏆" }
            ${questCategoryLabel(cat.category)}
          </div>
          ${cat.items.map(q => `
            <div class="quest-card ${q.done ? "complete" : ""}">
              <div class="quest-icon" style="background:${q.bg}">${q.icon}</div>
              <div class="quest-info">
                <h3>${c(q.title)}</h3>
                <p>${c(q.desc)}</p>
                <div class="quest-progress-bar">
                  <span style="width:${Math.round((q.progress/q.total)*100)}%"></span>
                </div>
              </div>
              <div class="quest-reward">
                <span>${q.done ? "✅" : q.icon}</span>
                +${q.reward} ${q.rewardLabel}
                <span class="quest-badge ${q.done ? "done" : ""}">${q.done ? t("done") : `${q.progress}/${q.total}`}</span>
              </div>
            </div>`).join("")}
        </div>`).join("")}`;
  } catch {
    panel.innerHTML = `<div class="empty-state"><p>${t("unableLoadQuests")}</p></div>`;
  }
}

function questCategoryLabel(category) {
  if (category === "Daily") return t("daily");
  if (category === "Milestone") return t("milestone");
  return t("certification");
}

/* ── LEADERBOARD ─────────────────────────────────────────────────────────── */
let lbScope = "global";

async function renderLeaderboard() {
  const panel = document.querySelector("#leaderboardPanel");
  panel.innerHTML = `<div class="empty-state" style="min-height:200px"><p>🏆 ${t("loading")}</p></div>`;
  try {
    const { players } = await api(`/api/leaderboard?scope=${lbScope}`);
    queueTranslation(players.map(p => p.badge).filter(Boolean));
    const colors = ["#00c9a7","#4c6ef5","#f06595","#fd7e14","#40c057","#845ef7","#ff6b6b","#ffe347","#20c997","#e64980"];
    panel.innerHTML = `
      <div class="lb-header">
        <h2>🏆 ${t("leaderboard")}</h2>
        <div class="lb-filters">
          <button class="lb-filter ${lbScope==="global"?"active":""}" data-scope="global">🌍 ${t("global")}</button>
          <button class="lb-filter ${lbScope==="friends"?"active":""}" data-scope="friends">👥 ${t("nearMe")}</button>
        </div>
      </div>
      <div class="lb-list">
        ${players.map(p => {
          const medal = p.rank===1 ? "gold" : p.rank===2 ? "silver" : p.rank===3 ? "bronze" : "";
          const color = colors[(p.id.charCodeAt(p.id.length-1)||0) % colors.length];
          return `
            <div class="lb-row ${medal} ${p.isMe ? "me" : ""}">
              <div class="lb-rank">${p.rank===1?"🥇":p.rank===2?"🥈":p.rank===3?"🥉":"#"+p.rank}</div>
              <div class="lb-avatar" style="background:${color}">${p.name[0]}</div>
              <div class="lb-name">
                ${p.name}${p.isMe ? `<span class="lb-you-tag">${t("you")}</span>` : ""}
                <small>🔥 ${t("dayStreak", { count: p.streak })} · ${c(p.badge)}</small>
              </div>
              <div class="lb-score">${p.xp.toLocaleString()} <small>XP</small></div>
            </div>`;
        }).join("")}
      </div>`;
    panel.querySelectorAll("[data-scope]").forEach(btn => {
      btn.addEventListener("click", () => { lbScope = btn.dataset.scope; renderLeaderboard(); });
    });
  } catch {
    panel.innerHTML = `<div class="empty-state"><p>${t("unableLoadLeaderboard")}</p></div>`;
  }
}

/* ── CHATBOT ─────────────────────────────────────────────────────────────── */
let chatHistory = [];
let chatReady = false;

function initChatbot() {
  if (chatReady) return;
  chatReady = true;
  addBotMessage(t("chatbotWelcome"));
  els.chatForm.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = els.chatInput.value.trim();
    if (!msg) return;
    const historyBeforeMessage = chatHistory.slice(-8);
    els.chatInput.value = "";
    addUserMessage(msg);
    const typingId = addTypingIndicator();
    try {
      const { reply } = await api("/api/chatbot", {
        method: "POST",
        body: JSON.stringify({ message: msg, history: historyBeforeMessage, language: currentLanguage() })
      });
      removeTypingIndicator(typingId);
      let translatedReply = reply;
      if (currentLanguage() !== "English") {
        await translateBatch([reply], currentLanguage());
        translatedReply = window.I18N.contentText(currentLanguage(), reply);
      }
      addBotMessage(translatedReply);
    } catch {
      removeTypingIndicator(typingId);
      addBotMessage(t("chatbotError"));
    }
  });
}

function addUserMessage(text) {
  chatHistory.push({ role:"user", content:text });
  const div = document.createElement("div");
  div.className = "chat-bubble user";
  div.textContent = text;
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function addBotMessage(text) {
  const safeText = String(text || "");
  chatHistory.push({ role:"assistant", content:safeText });
  const div = document.createElement("div");
  div.className = "chat-bubble bot";
  const name = document.createElement("span");
  name.className = "bubble-name";
  name.textContent = t("cybersafeBuddy");
  div.append(name, document.createTextNode(safeText));
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function addTypingIndicator() {
  const id = "typing-" + Date.now();
  const div = document.createElement("div");
  div.className = "chat-bubble bot typing"; div.id = id;
  div.innerHTML = `<span class="bubble-name">🤖 ${t("cybersafeBuddy")}</span><span class="typing-dots"><span></span><span></span><span></span></span>`;
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return id;
}
function removeTypingIndicator(id) { document.getElementById(id)?.remove(); }

/* ── EVENTS ──────────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════
   AVATAR BUILDER  –  Duolingo-style canvas avatar
   ═══════════════════════════════════════════════════════════════════════════ */
const AV = {
  /* ─── Palette ─────────────────────────────────────────────────────────── */
  skin:   ["#FDDBB4","#F5C18A","#E8A96A","#C68642","#A0522D","#7B3A1E","#4A2311"],
  hair:   ["#1a1a1a","#3B1F0A","#7B4B2A","#C4883A","#F5C518","#E8E8E8","#FF6B6B","#7B68EE","#2ECC71"],
  clothes:["#2563EB","#DC2626","#16A34A","#9333EA","#EA580C","#0891B2","#DB2777","#374151","#F59E0B"],

  /* ─── Feature banks ───────────────────────────────────────────────────── */
  faces: [
    { id:"oval",   label:"Oval",   draw:(c,x,y,w,h,sk)=>{ c.beginPath(); c.ellipse(x,y,w*.48,h*.52,0,0,Math.PI*2); c.fillStyle=sk; c.fill(); c.stroke(); } },
    { id:"round",  label:"Round",  draw:(c,x,y,w,h,sk)=>{ c.beginPath(); c.ellipse(x,y,w*.50,h*.50,0,0,Math.PI*2); c.fillStyle=sk; c.fill(); c.stroke(); } },
    { id:"square", label:"Square", draw:(c,x,y,w,h,sk)=>{ const r=14; c.beginPath(); c.roundRect(x-w*.48,y-h*.50,w*.96,h*.96,r); c.fillStyle=sk; c.fill(); c.stroke(); } },
    { id:"heart",  label:"Heart",  draw:(c,x,y,w,h,sk)=>{ c.beginPath(); c.moveTo(x,y+h*.46); c.bezierCurveTo(x-w*.50,y+h*.10,x-w*.55,y-h*.35,x,y-h*.10); c.bezierCurveTo(x+w*.55,y-h*.35,x+w*.50,y+h*.10,x,y+h*.46); c.fillStyle=sk; c.fill(); c.stroke(); } },
    { id:"diamond",label:"Diamond",draw:(c,x,y,w,h,sk)=>{ c.beginPath(); c.moveTo(x,y-h*.52); c.lineTo(x+w*.46,y); c.lineTo(x,y+h*.52); c.lineTo(x-w*.46,y); c.closePath(); c.fillStyle=sk; c.fill(); c.stroke(); } },
  ],

  eyes: [
    { id:"normal",  label:"Normal",  draw:(c,lx,rx,ey,col)=>{ [lx,rx].forEach(ex=>{ c.beginPath(); c.ellipse(ex,ey,9,7,0,0,Math.PI*2); c.fillStyle="#fff"; c.fill(); c.stroke(); c.beginPath(); c.ellipse(ex+1,ey+1,5,5,0,0,Math.PI*2); c.fillStyle=col; c.fill(); c.beginPath(); c.ellipse(ex+2,ey-1,2,2,0,0,Math.PI*2); c.fillStyle="#fff"; c.fill(); }); } },
    { id:"happy",   label:"Happy",   draw:(c,lx,rx,ey,col)=>{ [lx,rx].forEach(ex=>{ c.beginPath(); c.arc(ex,ey+3,8,Math.PI,0); c.strokeStyle="#333"; c.lineWidth=2.5; c.stroke(); c.lineWidth=1.5; }); } },
    { id:"sleepy",  label:"Sleepy",  draw:(c,lx,rx,ey,col)=>{ [lx,rx].forEach(ex=>{ c.beginPath(); c.ellipse(ex,ey+2,9,4,0,0,Math.PI*2); c.fillStyle="#fff"; c.fill(); c.stroke(); c.beginPath(); c.ellipse(ex,ey+3,5,3,0,0,Math.PI*2); c.fillStyle=col; c.fill(); c.beginPath(); c.moveTo(ex-9,ey+1); c.bezierCurveTo(ex-5,ey-4,ex+5,ey-4,ex+9,ey+1); c.strokeStyle="#333"; c.lineWidth=2; c.stroke(); c.lineWidth=1.5; }); } },
    { id:"star",    label:"Star",    draw:(c,lx,rx,ey,col)=>{ [lx,rx].forEach(ex=>{ c.save(); c.translate(ex,ey); for(let i=0;i<5;i++){ c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos((i*72-90)*Math.PI/180)*9,Math.sin((i*72-90)*Math.PI/180)*9); c.strokeStyle=col; c.lineWidth=2.5; c.stroke(); } c.restore(); c.beginPath(); c.arc(ex,ey,3,0,Math.PI*2); c.fillStyle=col; c.fill(); }); } },
    { id:"wink",    label:"Wink",    draw:(c,lx,rx,ey,col)=>{ c.beginPath(); c.ellipse(lx,ey,9,7,0,0,Math.PI*2); c.fillStyle="#fff"; c.fill(); c.stroke(); c.beginPath(); c.ellipse(lx+1,ey+1,5,5,0,0,Math.PI*2); c.fillStyle=col; c.fill(); c.beginPath(); c.moveTo(rx-9,ey+1); c.bezierCurveTo(rx-5,ey-5,rx+5,ey-5,rx+9,ey+1); c.strokeStyle="#333"; c.lineWidth=2.5; c.stroke(); c.lineWidth=1.5; } },
    { id:"cyber",   label:"Cyber",   draw:(c,lx,rx,ey,col)=>{ [lx,rx].forEach((ex,i)=>{ c.beginPath(); c.rect(ex-10,ey-5,20,11); c.fillStyle=i===0?"#0ff3":"#f0f3"; c.fill(); c.strokeStyle=i===0?"#0ff":"#f0f"; c.lineWidth=2; c.stroke(); c.lineWidth=1.5; c.beginPath(); c.moveTo(ex-8,ey+2); c.lineTo(ex+8,ey+2); c.strokeStyle="#fff"; c.lineWidth=1; c.stroke(); c.lineWidth=1.5; }); } },
  ],

  brows: [
    { id:"normal",  label:"Normal",  draw:(c,lx,rx,by)=>{ [[lx-10,lx+10],[rx-10,rx+10]].forEach(([x1,x2])=>{ c.beginPath(); c.moveTo(x1,by); c.lineTo(x2,by); c.strokeStyle="#333"; c.lineWidth=3; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; }); } },
    { id:"arched",  label:"Arched",  draw:(c,lx,rx,by)=>{ [[lx,rx]].flat().forEach(bx=>{ c.beginPath(); c.moveTo(bx-10,by+2); c.quadraticCurveTo(bx,by-5,bx+10,by+2); c.strokeStyle="#333"; c.lineWidth=3; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; }); [[lx,rx]].flat().forEach(bx=>{ c.beginPath(); c.moveTo(bx-10,by+2); c.quadraticCurveTo(bx,by-5,bx+10,by+2); c.strokeStyle="#333"; c.lineWidth=3; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; }); } },
    { id:"angry",   label:"Angry",   draw:(c,lx,rx,by)=>{ c.beginPath(); c.moveTo(lx-10,by-3); c.lineTo(lx+10,by+3); c.strokeStyle="#333"; c.lineWidth=3; c.lineCap="round"; c.stroke(); c.beginPath(); c.moveTo(rx-10,by+3); c.lineTo(rx+10,by-3); c.strokeStyle="#333"; c.lineWidth=3; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; } },
    { id:"raised",  label:"Raised",  draw:(c,lx,rx,by)=>{ [[lx,rx]].flat().forEach(bx=>{ c.beginPath(); c.moveTo(bx-10,by+1); c.lineTo(bx+10,by+1); c.strokeStyle="#333"; c.lineWidth=3; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; }); } },
    { id:"bushy",   label:"Bushy",   draw:(c,lx,rx,by)=>{ [[lx,rx]].flat().forEach(bx=>{ c.beginPath(); c.moveTo(bx-11,by+2); c.lineTo(bx+11,by+2); c.strokeStyle="#555"; c.lineWidth=6; c.lineCap="round"; c.stroke(); c.beginPath(); c.moveTo(bx-11,by+1); c.lineTo(bx+11,by+1); c.strokeStyle="#222"; c.lineWidth=2; c.stroke(); c.lineWidth=1.5; }); } },
  ],

  mouths: [
    { id:"smile",  label:"Smile",   draw:(c,mx,my)=>{ c.beginPath(); c.arc(mx,my-8,14,0.3,Math.PI-0.3); c.strokeStyle="#333"; c.lineWidth=2.5; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; } },
    { id:"grin",   label:"Grin",    draw:(c,mx,my)=>{ c.beginPath(); c.moveTo(mx-14,my-8); c.quadraticCurveTo(mx,my+8,mx+14,my-8); c.fillStyle="#c0392b"; c.fill(); c.strokeStyle="#333"; c.lineWidth=2; c.stroke(); c.lineWidth=1.5; } },
    { id:"smirk",  label:"Smirk",   draw:(c,mx,my)=>{ c.beginPath(); c.moveTo(mx-10,my-6); c.bezierCurveTo(mx-5,my-6,mx+5,my+4,mx+12,my-2); c.strokeStyle="#333"; c.lineWidth=2.5; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; } },
    { id:"neutral",label:"Neutral", draw:(c,mx,my)=>{ c.beginPath(); c.moveTo(mx-12,my-6); c.lineTo(mx+12,my-6); c.strokeStyle="#333"; c.lineWidth=2.5; c.lineCap="round"; c.stroke(); c.lineWidth=1.5; } },
    { id:"open",   label:"Open",    draw:(c,mx,my)=>{ c.beginPath(); c.ellipse(mx,my-6,10,8,0,0,Math.PI*2); c.fillStyle="#c0392b"; c.fill(); c.strokeStyle="#333"; c.lineWidth=2; c.stroke(); c.lineWidth=1.5; } },
    { id:"tongue", label:"Cheeky",  draw:(c,mx,my)=>{ c.beginPath(); c.moveTo(mx-12,my-8); c.quadraticCurveTo(mx,my+4,mx+12,my-8); c.fillStyle="#c0392b"; c.fill(); c.strokeStyle="#333"; c.lineWidth=2; c.stroke(); c.beginPath(); c.ellipse(mx,my+2,6,5,0,0.1,Math.PI-0.1); c.fillStyle="#e74c3c"; c.fill(); c.strokeStyle="#333"; c.lineWidth=1.5; c.stroke(); c.lineWidth=1.5; } },
  ],

  hairs: [
    { id:"none",   label:"Bald",  draw:(c,x,y,w,h,col)=>{ /* no hair */ } },
    { id:"short",  label:"Short", draw:(c,x,y,w,h,col)=>{ c.beginPath(); c.ellipse(x,y-h*.36,w*.48,h*.23,0,Math.PI,0); c.fillStyle=col; c.fill(); c.strokeStyle="#222"; c.lineWidth=2; c.stroke(); c.lineWidth=1.5; } },
    { id:"medium", label:"Medium",draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2; c.beginPath(); c.ellipse(x,y-h*.34,w*.48,h*.24,0,Math.PI,0); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x-w*.44,y-h*.20); c.quadraticCurveTo(x-w*.52,y+h*.08,x-w*.44,y+h*.22); c.moveTo(x+w*.44,y-h*.20); c.quadraticCurveTo(x+w*.52,y+h*.08,x+w*.44,y+h*.22); c.stroke(); c.lineWidth=1.5; } },
    { id:"long",   label:"Long",  draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2; c.beginPath(); c.ellipse(x,y-h*.34,w*.48,h*.24,0,Math.PI,0); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x-w*.44,y-h*.20); c.quadraticCurveTo(x-w*.56,y+h*.18,x-w*.40,y+h*.50); c.moveTo(x+w*.44,y-h*.20); c.quadraticCurveTo(x+w*.56,y+h*.18,x+w*.40,y+h*.50); c.stroke(); c.lineWidth=1.5; } },
    { id:"curly",  label:"Curly", draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2; c.beginPath(); c.arc(x,y-h*.38,w*.48,Math.PI*1.1,Math.PI*1.9); c.fill(); for(let i=0;i<8;i++){ const a=(i/7)*Math.PI+Math.PI; const cx2=x+Math.cos(a)*w*.46, cy2=y-h*.38+Math.sin(a)*h*.26; c.beginPath(); c.arc(cx2,cy2,9,0,Math.PI*2); c.fillStyle=col; c.fill(); c.stroke(); } c.lineWidth=1.5; } },
    { id:"bun",    label:"Bun",   draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2; c.beginPath(); c.ellipse(x,y-h*.34,w*.48,h*.24,0,Math.PI,0); c.fill(); c.stroke(); c.beginPath(); c.arc(x,y-h*.58,16,0,Math.PI*2); c.fillStyle=col; c.fill(); c.stroke(); c.lineWidth=1.5; } },
    { id:"spiky",  label:"Spiky", draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2; const pts=[[-40,-70],[-24,-82],[-8,-88],[8,-86],[24,-80],[40,-70]]; c.beginPath(); c.moveTo(x+pts[0][0]*w/100,y+pts[0][1]*h/100); pts.forEach(([px,py])=>{ const tip=[px-8,py-20]; c.lineTo(x+tip[0]*w/100,y+tip[1]*h/100); c.lineTo(x+(px+8)*w/100,y+py*h/100); }); c.quadraticCurveTo(x+w*.46,y-h*.22,x+w*.46,y-h*.06); c.quadraticCurveTo(x,y-h*.30,x-w*.46,y-h*.06); c.closePath(); c.fill(); c.stroke(); c.lineWidth=1.5; } },
  ],

  clothes: [
    { id:"tshirt", label:"T-Shirt",  draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2.5; c.beginPath(); c.moveTo(x-w*.38,y+h*.10); c.lineTo(x-w*.55,y+h*.0); c.lineTo(x-w*.70,y+h*.18); c.lineTo(x-w*.55,y+h*.30); c.lineTo(x-w*.48,y+h*.24); c.lineTo(x-w*.48,y+h*.60); c.lineTo(x+w*.48,y+h*.60); c.lineTo(x+w*.48,y+h*.24); c.lineTo(x+w*.55,y+h*.30); c.lineTo(x+w*.70,y+h*.18); c.lineTo(x+w*.55,y+h*.0); c.lineTo(x+w*.38,y+h*.10); c.quadraticCurveTo(x,y+h*.18,x-w*.38,y+h*.10); c.closePath(); c.fill(); c.stroke(); c.lineWidth=1.5; } },
    { id:"hoodie", label:"Hoodie",   draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2.5; c.beginPath(); c.moveTo(x-w*.36,y+h*.08); c.lineTo(x-w*.58,y-h*.02); c.lineTo(x-w*.72,y+h*.20); c.lineTo(x-w*.56,y+h*.34); c.lineTo(x-w*.50,y+h*.26); c.lineTo(x-w*.50,y+h*.60); c.lineTo(x+w*.50,y+h*.60); c.lineTo(x+w*.50,y+h*.26); c.lineTo(x+w*.56,y+h*.34); c.lineTo(x+w*.72,y+h*.20); c.lineTo(x+w*.58,y-h*.02); c.lineTo(x+w*.36,y+h*.08); c.bezierCurveTo(x+w*.20,y+h*.22,x-w*.20,y+h*.22,x-w*.36,y+h*.08); c.closePath(); c.fill(); c.stroke(); const dk=col+"cc"; c.fillStyle=dk; c.beginPath(); c.moveTo(x-w*.14,y+h*.08); c.lineTo(x+w*.14,y+h*.08); c.lineTo(x+w*.06,y+h*.60); c.lineTo(x-w*.06,y+h*.60); c.closePath(); c.fill(); c.lineWidth=1.5; } },
    { id:"suit",   label:"Suit",     draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2.5; c.beginPath(); c.moveTo(x-w*.36,y+h*.10); c.lineTo(x-w*.56,y+h*.02); c.lineTo(x-w*.70,y+h*.22); c.lineTo(x-w*.54,y+h*.32); c.lineTo(x-w*.48,y+h*.26); c.lineTo(x-w*.48,y+h*.60); c.lineTo(x+w*.48,y+h*.60); c.lineTo(x+w*.48,y+h*.26); c.lineTo(x+w*.54,y+h*.32); c.lineTo(x+w*.70,y+h*.22); c.lineTo(x+w*.56,y+h*.02); c.lineTo(x+w*.36,y+h*.10); c.quadraticCurveTo(x+w*.18,y+h*.30,x,y+h*.14); c.quadraticCurveTo(x-w*.18,y+h*.30,x-w*.36,y+h*.10); c.closePath(); c.fill(); c.stroke(); c.fillStyle="#fff"; c.beginPath(); c.moveTo(x,y+h*.14); c.lineTo(x+w*.12,y+h*.10); c.lineTo(x+w*.06,y+h*.60); c.lineTo(x-w*.06,y+h*.60); c.lineTo(x-w*.12,y+h*.10); c.closePath(); c.fill(); c.stroke(); c.lineWidth=1.5; } },
    { id:"uniform",label:"Uniform",  draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2.5; c.beginPath(); c.moveTo(x-w*.36,y+h*.10); c.lineTo(x-w*.58,y+h*.0); c.lineTo(x-w*.70,y+h*.18); c.lineTo(x-w*.55,y+h*.30); c.lineTo(x-w*.48,y+h*.24); c.lineTo(x-w*.48,y+h*.60); c.lineTo(x+w*.48,y+h*.60); c.lineTo(x+w*.48,y+h*.24); c.lineTo(x+w*.55,y+h*.30); c.lineTo(x+w*.70,y+h*.18); c.lineTo(x+w*.58,y+h*.0); c.lineTo(x+w*.36,y+h*.10); c.quadraticCurveTo(x,y+h*.18,x-w*.36,y+h*.10); c.closePath(); c.fill(); c.stroke(); for(let i=0;i<3;i++){ c.beginPath(); c.arc(x,y+h*(.25+i*.10),5,0,Math.PI*2); c.fillStyle="#ffd700"; c.fill(); c.stroke(); } c.lineWidth=1.5; } },
    { id:"tank",   label:"Tank Top", draw:(c,x,y,w,h,col)=>{ c.fillStyle=col; c.strokeStyle="#222"; c.lineWidth=2.5; c.beginPath(); c.moveTo(x-w*.28,y+h*.06); c.lineTo(x-w*.14,y+h*.04); c.lineTo(x-w*.14,y+h*.04); c.quadraticCurveTo(x,y+h*.10,x+w*.14,y+h*.04); c.lineTo(x+w*.28,y+h*.06); c.lineTo(x+w*.44,y+h*.18); c.lineTo(x+w*.44,y+h*.60); c.lineTo(x-w*.44,y+h*.60); c.lineTo(x-w*.44,y+h*.18); c.closePath(); c.fill(); c.stroke(); c.lineWidth=1.5; } },
  ],

  accessories: [
    { id:"none",    label:"None",    draw:(c,x,y,w,h)=>{ } },
    { id:"glasses", label:"Glasses", draw:(c,x,y,w,h)=>{ const ey=y-h*.06; const lx=x-w*.22,rx=x+w*.22; [lx,rx].forEach(ex=>{ c.beginPath(); c.ellipse(ex,ey,14,11,0,0,Math.PI*2); c.strokeStyle="#333"; c.lineWidth=2.5; c.stroke(); }); c.beginPath(); c.moveTo(lx+14,ey); c.lineTo(rx-14,ey); c.stroke(); c.beginPath(); c.moveTo(lx-14,ey); c.lineTo(lx-22,ey-4); c.moveTo(rx+14,ey); c.lineTo(rx+22,ey-4); c.stroke(); c.lineWidth=1.5; } },
    { id:"sunglasses",label:"Shades",draw:(c,x,y,w,h)=>{ const ey=y-h*.06; const lx=x-w*.22,rx=x+w*.22; [lx,rx].forEach(ex=>{ c.beginPath(); c.ellipse(ex,ey,14,10,0,0,Math.PI*2); c.fillStyle="#1a1a1a"; c.fill(); c.strokeStyle="#555"; c.lineWidth=2; c.stroke(); }); c.beginPath(); c.moveTo(lx+14,ey); c.lineTo(rx-14,ey); c.strokeStyle="#555"; c.stroke(); c.beginPath(); c.moveTo(lx-14,ey); c.lineTo(lx-22,ey-4); c.moveTo(rx+14,ey); c.lineTo(rx+22,ey-4); c.stroke(); c.lineWidth=1.5; } },
    { id:"hat",     label:"Cap",     draw:(c,x,y,w,h)=>{ c.fillStyle="#2563eb"; c.strokeStyle="#1a1a1a"; c.lineWidth=2.5; c.beginPath(); c.ellipse(x,y-h*.48,w*.52,h*.10,0,Math.PI,0); c.fill(); c.stroke(); c.beginPath(); c.rect(x-w*.44,y-h*.48,w*.88,h*.22); c.fill(); c.stroke(); c.beginPath(); c.ellipse(x+w*.10,y-h*.26,w*.30,h*.05,-.2,0,Math.PI*2); c.fillStyle="#1d4ed8"; c.fill(); c.lineWidth=1.5; } },
    { id:"headband",label:"Headband",draw:(c,x,y,w,h)=>{ c.beginPath(); c.arc(x,y-h*.38,w*.48,Math.PI*1.1,Math.PI*1.9); c.strokeStyle="#e74c3c"; c.lineWidth=8; c.stroke(); c.lineWidth=1.5; } },
    { id:"crown",   label:"Crown",   draw:(c,x,y,w,h)=>{ c.fillStyle="#f59e0b"; c.strokeStyle="#92400e"; c.lineWidth=2.5; const pts=[[x-w*.38,y-h*.56],[x-w*.30,y-h*.68],[x-w*.14,y-h*.58],[x,y-h*.74],[x+w*.14,y-h*.58],[x+w*.30,y-h*.68],[x+w*.38,y-h*.56]]; c.beginPath(); c.moveTo(pts[0][0],pts[0][1]); pts.forEach(([px,py])=>c.lineTo(px,py)); c.lineTo(x+w*.38,y-h*.46); c.lineTo(x-w*.38,y-h*.46); c.closePath(); c.fill(); c.stroke(); [[x-w*.14,y-h*.52],[x,y-h*.52],[x+w*.14,y-h*.52]].forEach(([gx,gy])=>{ c.beginPath(); c.arc(gx,gy,4,0,Math.PI*2); c.fillStyle="#e74c3c"; c.fill(); }); c.lineWidth=1.5; } },
  ],

  /* ─── State ───────────────────────────────────────────────────────────── */
  current: {
    skinIdx:    0,
    faceIdx:    0,
    eyesIdx:    0,
    browsIdx:   0,
    mouthIdx:   0,
    hairIdx:    2,
    hairColIdx: 0,
    clothesIdx: 0,
    clothColIdx:0,
    accIdx:     0,
  },

  /* ─── Draw one frame ──────────────────────────────────────────────────── */
  draw() {
    const canvas = document.getElementById("avatarCanvas");
    if (!canvas) return;
    const c = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    // ── Single consistent coordinate system ──────────────────────────────────
    // Avatar canvas is 220×220. Keep proportions inside the circle without
    // cropping the torso or overhanging hair.
    const cx    = W / 2;
    const faceX = cx;
    const faceY = H * 0.39;          // face center Y
    const fw    = W * 0.68;          // face bounding width
    const fh    = H * 0.46;          // face bounding height

    // Derived landmarks (used by all layers)
    const neckTop    = faceY + fh * 0.50;      // where neck starts below face
    const neckBot    = neckTop + H * 0.11;     // where neck ends / body top
    const neckW      = fw * 0.18;
    const earY       = faceY - fh * 0.02;      // ear center vertically aligned with mid-face
    const eyY        = faceY - fh * 0.11;
    const eyL        = faceX - fw * 0.22;
    const eyR        = faceX + fw * 0.22;
    const brY        = eyY - 11;

    c.clearRect(0, 0, W, H);

    // Keep the avatar inside the circular preview.
    c.save();
    c.beginPath();
    c.arc(cx, H / 2, Math.min(W, H) / 2 - 3, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = "#2b2b2b";
    c.lineWidth = 1.2;

    const sk = AV.skin   [AV.current.skinIdx];
    const hc = AV.hair   [AV.current.hairColIdx];
    const cc = AV.clothes[AV.current.clothColIdx];

    // 1. CLOTHES — drawn first so face overlaps naturally
    //    Pass neckBot as the body Y origin so clothes start right where neck ends
    AV.clothes[AV.current.clothesIdx].draw(c, faceX, neckBot, fw, fh, cc);
    // Subtle shirt shading for a cleaner vector look.
    const clothShade = c.createLinearGradient(faceX, neckBot, faceX, neckBot + fh * 0.7);
    clothShade.addColorStop(0, "rgba(0,0,0,0.00)");
    clothShade.addColorStop(1, "rgba(0,0,0,0.12)");
    c.fillStyle = clothShade;
    c.beginPath();
    c.ellipse(faceX, neckBot + fh * 0.30, fw * 0.30, fh * 0.20, 0, 0, Math.PI * 2);
    c.fill();

    // 2. NECK — connects face bottom to clothes top
    c.fillStyle = sk; c.strokeStyle = "#2b2b2b"; c.lineWidth = 1.6;
    c.beginPath();
    c.roundRect(faceX - neckW/2, neckTop, neckW, neckBot - neckTop + 4, 4);
    c.fill(); c.stroke();

    // 3. EARS — flush with face sides at earY
    c.lineWidth = 1.6;
    [-1, 1].forEach(s => {
      c.beginPath();
      c.ellipse(faceX + s * (fw * 0.48 + 2), earY, 9, 14, 0, 0, Math.PI * 2);
      c.fillStyle = sk; c.fill(); c.stroke();
    });

    // 4. FACE SHAPE
    AV.faces[AV.current.faceIdx].draw(c, faceX, faceY, fw, fh, sk);

    // Soft skin gradient overlay (bitmoji-like finish).
    const skinGlow = c.createRadialGradient(faceX, faceY - fh * 0.2, fh * 0.2, faceX, faceY, fh * 0.7);
    skinGlow.addColorStop(0, "rgba(255,255,255,0.30)");
    skinGlow.addColorStop(1, "rgba(0,0,0,0.10)");
    c.fillStyle = skinGlow;
    c.beginPath();
    c.ellipse(faceX, faceY, fw * 0.48, fh * 0.52, 0, 0, Math.PI * 2);
    c.fill();

    // 5. HAIR BACK (behind face features but on top of face fill)
    AV.hairs[AV.current.hairIdx].draw(c, faceX, faceY, fw, fh, hc);

    // 6. EYES
    const eyCol = ["#3B2006","#1B4F72","#1D6A34","#6C3483","#1a1a1a"][AV.current.skinIdx > 3 ? 1 : 0];
    AV.eyes[AV.current.eyesIdx].draw(c, eyL, eyR, eyY, eyCol);
    // Extra highlight for the Snapchat-style sheen.
    [eyL, eyR].forEach(ex => {
      c.beginPath();
      c.ellipse(ex + 3, eyY - 3, 3, 2, 0, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.fill();
    });

    // 7. BROWS
    AV.brows[AV.current.browsIdx].draw(c, eyL, eyR, brY);

    // 8. NOSE
    c.beginPath();
    c.moveTo(faceX - 4, faceY + fh * 0.06);
    c.quadraticCurveTo(faceX + 7, faceY + fh * 0.13, faceX + 4, faceY + fh * 0.19);
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 1.6; c.lineCap = "round"; c.stroke(); c.lineWidth = 1.2;

    // 9. MOUTH
    AV.mouths[AV.current.mouthIdx].draw(c, faceX, faceY + fh * 0.30);

    // Soft chin shadow to ground the head.
    c.beginPath();
    c.ellipse(faceX, faceY + fh * 0.46, fw * 0.18, fh * 0.08, 0, 0, Math.PI * 2);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fill();

    // 10. BLUSH
    [eyL, eyR].forEach(bx => {
      const grd = c.createRadialGradient(bx + 10 * Math.sign(bx - faceX), eyY + 20, 0,
                                          bx + 10 * Math.sign(bx - faceX), eyY + 20, 16);
      grd.addColorStop(0, "rgba(255,120,120,0.20)");
      grd.addColorStop(1, "transparent");
      c.fillStyle = grd;
      c.beginPath();
      c.ellipse(bx + 10 * Math.sign(bx - faceX), eyY + 20, 16, 11, 0, 0, Math.PI * 2);
      c.fill();
    });

    // 11. ACCESSORIES
    AV.accessories[AV.current.accIdx].draw(c, faceX, faceY, fw, fh);

    c.lineWidth = 1.2;
    c.restore();
  },

  /* ─── Encode current config to a data-url string ─────────────────────── */
  toDataUrl() {
    const canvas = document.getElementById("avatarCanvas");
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
  },

  /* ─── Load from JSON stored in avatarConfig ───────────────────────────── */
  loadConfig(cfg) {
    if (!cfg) return;
    Object.assign(AV.current, cfg);
  },

  /* ─── Randomise ───────────────────────────────────────────────────────── */
  randomise() {
    const rnd = (arr) => Math.floor(Math.random()*arr.length);
    AV.current.skinIdx    = rnd(AV.skin);
    AV.current.faceIdx    = rnd(AV.faces);
    AV.current.eyesIdx    = rnd(AV.eyes);
    AV.current.browsIdx   = rnd(AV.brows);
    AV.current.mouthIdx   = rnd(AV.mouths);
    AV.current.hairIdx    = rnd(AV.hairs);
    AV.current.hairColIdx = rnd(AV.hair);
    AV.current.clothesIdx = rnd(AV.clothes);
    AV.current.clothColIdx= rnd(AV.clothes);
    AV.current.accIdx     = rnd(AV.accessories);
    AV.draw();
    avSyncChips();
  },
};

/* ── Build the builder UI ──────────────────────────────────────────────────── */
function buildAvatarUI() {
  // Skin swatches
  avColorRow("avSkinRow", AV.skin, AV.current.skinIdx, (i)=>{ AV.current.skinIdx=i; AV.draw(); });

  // Feature chips
  avChipRow("avFaceRow",   AV.faces,       AV.current.faceIdx,    (i)=>{ AV.current.faceIdx=i; AV.draw(); });
  avChipRow("avEyesRow",   AV.eyes,        AV.current.eyesIdx,    (i)=>{ AV.current.eyesIdx=i; AV.draw(); });
  avChipRow("avBrowsRow",  AV.brows,       AV.current.browsIdx,   (i)=>{ AV.current.browsIdx=i; AV.draw(); });
  avChipRow("avMouthRow",  AV.mouths,      AV.current.mouthIdx,   (i)=>{ AV.current.mouthIdx=i; AV.draw(); });
  avChipRow("avHairRow",   AV.hairs,       AV.current.hairIdx,    (i)=>{ AV.current.hairIdx=i; const noHair=AV.hairs[i].id==="none"; document.getElementById("avHairColorGroup").style.opacity=noHair?".3":"1"; AV.draw(); });
  avColorRow("avHairColorRow",AV.hair,     AV.current.hairColIdx, (i)=>{ AV.current.hairColIdx=i; AV.draw(); });
  avChipRow("avClothesRow",AV.clothes,     AV.current.clothesIdx, (i)=>{ AV.current.clothesIdx=i; AV.draw(); });
  avColorRow("avClothesColorRow",AV.clothes,(AV.current.clothColIdx), (i)=>{ AV.current.clothColIdx=i; AV.draw(); });
  avChipRow("avAccRow",    AV.accessories, AV.current.accIdx,     (i)=>{ AV.current.accIdx=i; AV.draw(); });

  document.getElementById("avRandomBtn").addEventListener("click", AV.randomise.bind(AV));

  // Tab switching
  document.querySelectorAll(".av-tab").forEach(btn => {
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".av-tab").forEach(t=>t.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.avtab;
      document.getElementById("avPanelBuilder").classList.toggle("hidden", tab!=="builder");
      document.getElementById("avPanelUpload").classList.toggle("hidden", tab!=="upload");
    });
  });

  AV.draw();
}

function avColorRow(containerId, palette, activeIdx, onSelect) {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.innerHTML = "";
  palette.forEach((col, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "av-swatch" + (i === activeIdx ? " active" : "");
    btn.style.background = col;
    btn.title = col;
    btn.dataset.idx = i;
    btn.addEventListener("click", () => {
      row.querySelectorAll(".av-swatch").forEach(s=>s.classList.remove("active"));
      btn.classList.add("active");
      onSelect(i);
    });
    row.appendChild(btn);
  });
}

function avChipRow(containerId, items, activeIdx, onSelect) {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.innerHTML = "";
  items.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "av-chip" + (i === activeIdx ? " active" : "");
    btn.textContent = item.label;
    btn.dataset.idx = i;
    btn.addEventListener("click", () => {
      row.querySelectorAll(".av-chip").forEach(s=>s.classList.remove("active"));
      btn.classList.add("active");
      onSelect(i);
    });
    row.appendChild(btn);
  });
}

/* re-sync chips after randomise */
function avSyncChips() {
  const sync = (rowId, idx) => {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.querySelectorAll("[data-idx]").forEach(b => b.classList.toggle("active", Number(b.dataset.idx)===idx));
  };
  sync("avSkinRow",        AV.current.skinIdx);
  sync("avFaceRow",        AV.current.faceIdx);
  sync("avEyesRow",        AV.current.eyesIdx);
  sync("avBrowsRow",       AV.current.browsIdx);
  sync("avMouthRow",       AV.current.mouthIdx);
  sync("avHairRow",        AV.current.hairIdx);
  sync("avHairColorRow",   AV.current.hairColIdx);
  sync("avClothesRow",     AV.current.clothesIdx);
  sync("avClothesColorRow",AV.current.clothColIdx);
  sync("avAccRow",         AV.current.accIdx);
}

/* ── Logout ────────────────────────────────────────────────────────────────── */
async function handleLogout() {
  if (!confirm("Log out? Your progress will be saved.")) return;
  await api("/api/logout", { method: "POST" });
  // Clear local energy state
  localStorage.removeItem("cybersafe_energy");
  localStorage.removeItem("cybersafe_energy_ts");
  window.location.href = "/login";
}

function attachGlobalEvents() {
  els.loginForm.addEventListener("submit", e => { e.preventDefault(); saveProfile("login"); });
  els.profileForm.addEventListener("submit", e => { e.preventDefault(); saveProfile("settings"); });

  els.avatarInput.addEventListener("change", async () => {
    state.avatarDraft = await resizeAvatar(els.avatarInput.files[0]);
    paintAvatar(els.avatarPreview, state.data.profile, state.avatarDraft);
  });

  els.profileLanguage.addEventListener("change", async () => {
    const role = els.profileRole.value, pathId = selectedLoginPath();
    await prepareLanguage(els.profileLanguage.value);
    applyStaticTranslations();
    fillRoleSelect(els.profileRole, role);
    renderLevelPicker(els.levelPicker, pathId);
  });
  els.levelPicker.addEventListener("change", () => applyPathTheme(selectedLoginPath()));
  els.settingsAvatarInput.addEventListener("change", async () => {
    state.settingsAvatarDraft = await resizeAvatar(els.settingsAvatarInput.files[0]);
    paintAvatar(els.settingsAvatarPreview, state.data.profile, state.settingsAvatarDraft);
  });
  els.settingsLanguage.addEventListener("change", async () => {
    const role = els.settingsRole.value;
    const pathId = els.settingsLevelPicker.querySelector("input[name='activePathId']:checked")?.value || state.data.profile.activePathId;
    await prepareLanguage(els.settingsLanguage.value);
    applyStaticTranslations();
    fillRoleSelect(els.settingsRole, role);
    renderLevelPicker(els.settingsLevelPicker, pathId);
  });
  els.settingsLevelPicker.addEventListener("change", () => {
    const pathId = els.settingsLevelPicker.querySelector("input[name='activePathId']:checked")?.value || state.data.profile.activePathId;
    applyPathTheme(pathId);
  });

  els.profileButton.addEventListener("click", () => {
    populateSettingsForm();
    els.settingsMessage.textContent = "";
    els.profileModal.classList.remove("hidden");
  });
  els.closeProfile.addEventListener("click", () => {
    els.profileModal.classList.add("hidden");
    applyPathTheme(state.data.profile.activePathId);
  });
  els.profileModal.addEventListener("click", e => {
    if (e.target === els.profileModal) {
      els.profileModal.classList.add("hidden");
      applyPathTheme(state.data.profile.activePathId);
    }
  });
  els.certificateButton.addEventListener("click", openCertificate);
  els.closeCertificate.addEventListener("click", () => els.certificateModal.classList.add("hidden"));
  els.issueCertificate.addEventListener("click", issueCertificate);
  els.certificateModal.addEventListener("click", e => { if (e.target === els.certificateModal) els.certificateModal.classList.add("hidden"); });

  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  els.backToMap.addEventListener("click", () => {
    state.selected = null;
    state.session = null;
    state.simulation = null;
    state.quizIndex = 0;
    state.answers = [];
    state.finalAnswers = [];
    state.retryQueue = [];
    state.answerFeedback = null;
    // Slide-out then hide
    els.activityPage.classList.add("page-exit");
    setTimeout(() => {
      els.activityPage.classList.remove("page-exit");
      hideActivityPage();
      renderPathMap();
    }, 320);
  });

  // Energy pill → show restore timer
  document.getElementById("energyPill").addEventListener("click", showEnergyTimer);

  // Logout
  document.getElementById("logoutButton").addEventListener("click", handleLogout);
}

/* ── RENDER ──────────────────────────────────────────────────────────────── */
function render() {
  const needsOnboarding = !state.data.profile.onboarded;
  applyPathTheme(state.data.profile.activePathId);
  document.body.classList.toggle("auth-mode", needsOnboarding);
  els.authScreen.classList.toggle("hidden", !needsOnboarding);
  if (needsOnboarding) { populateLoginForm(); return; }
  renderHeader();
  renderPathMap();
  if (!state.selected && !state.session && !state.simulation) {
    updateActivityHead({ eyebrow: t("ready"), title: t("chooseUnlockedLevel") });
  }
}

/* ── INIT ─────────────────────────────────────────────────────────────────── */
async function init() {
  // Auth guard: redirect to login if not authenticated
  try {
    const r = await fetch("/api/me");
    const me = await r.json();
    if (!me.loggedIn) { window.location.href = "/login"; return; }
  } catch {
    window.location.href = "/login"; return;
  }
  energyLoad();
  startEnergyRestoreTicker();
  attachGlobalEvents();
  const data = await api("/api/bootstrap");
  setData(data);
  renderEnergy();
}

init().catch(err => {
  document.querySelector("#activityBody").innerHTML = `
    <div class="result-card"><h3>${t("appCouldNotStart")}</h3><p>${err.message}</p></div>`;
});
