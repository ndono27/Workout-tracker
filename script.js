const USER_STORE_KEY = 'workoutUsers';
const ACTIVE_USER_KEY = 'workoutActiveUser';
const VIDEO_CLIP_DB_NAME = 'workoutTrackerVideoClips';
const VIDEO_CLIP_STORE = 'blobs';

let videoClipDbPromise = null;
const videoPlaybackObjectUrls = [];

function safeUserSegmentForBlobKey(username) {
  return String(username || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 48);
}

function revokeAllVideoPlaybackObjectUrls() {
  while (videoPlaybackObjectUrls.length) {
    const u = videoPlaybackObjectUrls.pop();
    try {
      URL.revokeObjectURL(u);
    } catch (_) {
      /* ignore */
    }
  }
}

function openVideoClipDb() {
  if (videoClipDbPromise) return videoClipDbPromise;
  videoClipDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(VIDEO_CLIP_DB_NAME, 1);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VIDEO_CLIP_STORE)) {
        db.createObjectStore(VIDEO_CLIP_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return videoClipDbPromise;
}

function storeVideoClipBlob(blobKey, blob) {
  return openVideoClipDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(VIDEO_CLIP_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
        tx.objectStore(VIDEO_CLIP_STORE).put(blob, blobKey);
      })
  );
}

function getVideoClipBlob(blobKey) {
  return openVideoClipDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(VIDEO_CLIP_STORE, 'readonly');
        const r = tx.objectStore(VIDEO_CLIP_STORE).get(blobKey);
        r.onsuccess = () => resolve(r.result instanceof Blob ? r.result : null);
        r.onerror = () => reject(r.error || new Error('IndexedDB read failed'));
      })
  );
}

function deleteVideoClipBlob(blobKey) {
  if (!blobKey) return Promise.resolve();
  return openVideoClipDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(VIDEO_CLIP_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
        tx.objectStore(VIDEO_CLIP_STORE).delete(blobKey);
      })
  );
}

function sanitizeVideoLibraryOnLoad(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  Object.entries(raw).forEach(([gKey, group]) => {
    if (!group || typeof group !== 'object') return;
    const exerciseName = String(group.exerciseName || gKey || 'Exercise').trim() || 'Exercise';
    const kept = [];
    (group.videos || []).forEach((v) => {
      if (!v || typeof v !== 'object') return;
      if (typeof v.blobKey === 'string' && v.blobKey.trim()) {
        const { url: _u, ...rest } = v;
        kept.push(rest);
        return;
      }
      const u = v.url;
      if (typeof u === 'string' && u.startsWith('data:')) {
        kept.push(v);
        return;
      }
    });
    if (kept.length) {
      out[gKey] = { exerciseName, videos: kept };
    }
  });
  return out;
}

function stripVideoLibraryForPersistence(library) {
  if (!library || typeof library !== 'object') return {};
  const out = {};
  Object.entries(library).forEach(([gKey, group]) => {
    if (!group || typeof group !== 'object' || !Array.isArray(group.videos)) return;
    out[gKey] = {
      exerciseName: group.exerciseName,
      videos: group.videos.map((v) => {
        if (!v || typeof v !== 'object') return v;
        const base = {
          blobKey: v.blobKey,
          dateLabel: v.dateLabel,
          dayKey: v.dayKey,
          workoutTitle: v.workoutTitle,
          sessionId: v.sessionId,
          exerciseName: v.exerciseName,
          setIndex: v.setIndex,
          timestamp: v.timestamp
        };
        if (typeof v.url === 'string' && v.url.startsWith('data:')) {
          return { ...base, url: v.url };
        }
        return base;
      })
    };
  });
  return out;
}

async function resolveVideoItemPlaybackUrl(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.blobKey === 'string' && item.blobKey.trim()) {
    try {
      const blob = await getVideoClipBlob(item.blobKey.trim());
      if (!blob || blob.size === 0) return null;
      const url = URL.createObjectURL(blob);
      videoPlaybackObjectUrls.push(url);
      return url;
    } catch (_) {
      return null;
    }
  }
  const u = item.url;
  if (typeof u === 'string' && u.startsWith('data:')) {
    return u;
  }
  return null;
}

function applyDataToState(data) {
  const d = data && typeof data === 'object' ? data : buildEmptyUserData();
  state.workouts = Array.isArray(d.workouts) ? d.workouts : [];
  state.calendarEntries =
    d.calendarEntries && typeof d.calendarEntries === 'object' ? d.calendarEntries : {};
  state.completedWorkoutDays =
    d.completedWorkoutDays && typeof d.completedWorkoutDays === 'object' ? d.completedWorkoutDays : {};
  state.personalBests = d.personalBests && typeof d.personalBests === 'object' ? d.personalBests : {};
  state.videoLibrary = sanitizeVideoLibraryOnLoad(d.videoLibrary && typeof d.videoLibrary === 'object' ? d.videoLibrary : {});
  state.activeSession = d.activeSession && typeof d.activeSession === 'object' ? d.activeSession : null;
  state.selectedDay = typeof d.selectedDay === 'string' ? d.selectedDay : null;
  const parsedCurrentDate = d.currentDateIso ? new Date(d.currentDateIso) : null;
  state.currentDate =
    parsedCurrentDate && !Number.isNaN(parsedCurrentDate.getTime()) ? parsedCurrentDate : new Date();
  const wg = d.weeklyWorkoutGoal;
  state.weeklyWorkoutGoal =
    wg != null && Number.isFinite(Number(wg)) && Number(wg) >= 1 ? Math.min(14, Math.round(Number(wg))) : null;
}

function buildEmptyUserData() {
  return {
    dataVersion: 1,
    workouts: [],
    calendarEntries: {},
    completedWorkoutDays: {},
    personalBests: {},
    videoLibrary: {},
    activeSession: null,
    selectedDay: null,
    currentDateIso: null,
    weeklyWorkoutGoal: null
  };
}

function normalizeUserRecord(rawUser) {
  const data = rawUser && typeof rawUser === 'object' && rawUser.data && typeof rawUser.data === 'object' ? rawUser.data : {};
  return {
    username: String(rawUser?.username || ''),
    password: String(rawUser?.password || ''),
    data: {
      ...data,
      dataVersion: Number.isFinite(data.dataVersion) ? data.dataVersion : 1,
      workouts: Array.isArray(data.workouts) ? data.workouts : [],
      calendarEntries: data.calendarEntries && typeof data.calendarEntries === 'object' ? data.calendarEntries : {},
      completedWorkoutDays:
        data.completedWorkoutDays && typeof data.completedWorkoutDays === 'object' ? data.completedWorkoutDays : {},
      personalBests: data.personalBests && typeof data.personalBests === 'object' ? data.personalBests : {},
      videoLibrary: data.videoLibrary && typeof data.videoLibrary === 'object' ? data.videoLibrary : {},
      activeSession: data.activeSession && typeof data.activeSession === 'object' ? data.activeSession : null,
      selectedDay: typeof data.selectedDay === 'string' ? data.selectedDay : null,
      currentDateIso: typeof data.currentDateIso === 'string' ? data.currentDateIso : null,
      weeklyWorkoutGoal: (() => {
        const v = data.weeklyWorkoutGoal;
        if (v == null || v === '') return null;
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n < 1) return null;
        return Math.min(14, n);
      })()
    }
  };
}

function getUsers() {
  const raw = JSON.parse(localStorage.getItem(USER_STORE_KEY) || '[]');
  return Array.isArray(raw) ? raw.map(normalizeUserRecord) : [];
}

function setUsers(users) {
  const existingRaw = localStorage.getItem(USER_STORE_KEY);
  if (existingRaw) {
    localStorage.setItem(`${USER_STORE_KEY}:backup`, existingRaw);
  }
  localStorage.setItem(USER_STORE_KEY, JSON.stringify(users.map(normalizeUserRecord)));
}

const state = {
  currentDate: new Date(),
  selectedDay: null,
  workouts: [],
  calendarEntries: {},
  completedWorkoutDays: {},
  personalBests: {},
  videoLibrary: {},
  activeSession: null,
  activeUser: null,
  weeklyWorkoutGoal: null
};

const monthLabel = document.getElementById('month-label');
const calendarGrid = document.getElementById('calendar-grid');
const selectedDateText = document.getElementById('selected-date-text');
const dayWorkouts = document.getElementById('day-workouts');
const dayWorkoutSelect = document.getElementById('day-workout-select');
const assignDayWorkoutButton = document.getElementById('assign-day-workout-button');
const workoutNameInput = document.getElementById('workout-name');
const addExerciseButton = document.getElementById('add-exercise-button');
const addSupersetButton = document.getElementById('add-superset-button');
const exerciseList = document.getElementById('exercise-list');
const saveWorkoutButton = document.getElementById('save-workout-button');
const cancelEditWorkoutButton = document.getElementById('cancel-edit-workout-button');
const savedWorkoutsContainer = document.getElementById('saved-workouts');
const activeWorkoutRoot = document.getElementById('active-workout-root');
const activeWorkoutTitle = document.getElementById('active-workout-title');
const activeWorkoutDateLine = document.getElementById('active-workout-date-line');
const activeWorkoutActions = document.getElementById('active-workout-actions');
const discardActiveWorkoutButton = document.getElementById('discard-active-workout');
const finishActiveWorkoutButton = document.getElementById('finish-active-workout');
const workoutCompleteModal = document.getElementById('workout-complete-modal');
const workoutDurationText = document.getElementById('workout-duration-text');
const workoutPbList = document.getElementById('workout-pb-list');
const closeWorkoutCompleteButton = document.getElementById('close-workout-complete');
const videosRoot = document.getElementById('videos-root');
const videoCaptureModal = document.getElementById('video-capture-modal');
const videoPreview = document.getElementById('video-preview');
const videoCaptureStatus = document.getElementById('video-capture-status');
const switchCameraButton = document.getElementById('switch-camera-button');
const recordVideoButton = document.getElementById('record-video-button');
const closeVideoCaptureButton = document.getElementById('close-video-capture');
const totalWorkoutsElem = document.getElementById('total-workouts');
const plannedDaysElem = document.getElementById('planned-days');
const nextWorkoutElem = document.getElementById('next-workout');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');
const prevMonthButton = document.getElementById('prev-month');
const nextMonthButton = document.getElementById('next-month');
const appContent = document.getElementById('app-content');
const authPanel = document.getElementById('auth-panel');
const authStatusText = document.getElementById('auth-status-text');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const createAccountButton = document.getElementById('create-account-button');
const loginButton = document.getElementById('login-button');
const accountMenu = document.getElementById('account-menu');
const accountMenuButton = document.getElementById('account-menu-button');
const accountDropdown = document.getElementById('account-dropdown');
const accountLogoutButton = document.getElementById('account-logout-button');

let activeVideoStream = null;
let activeMediaRecorder = null;
let activeVideoChunks = [];
let activeVideoContext = null;
let videoFacingMode = 'environment';
let scheduledSaveTimeout = null;
let builderEditIndex = null;

function scheduleSaveState(delayMs = 250) {
  if (!state.activeUser) {
    return;
  }
  if (scheduledSaveTimeout) {
    clearTimeout(scheduledSaveTimeout);
  }
  scheduledSaveTimeout = window.setTimeout(() => {
    scheduledSaveTimeout = null;
    void saveState();
  }, delayMs);
}

function saveState() {
  if (!state.activeUser) {
    return;
  }

  const users = getUsers();
  const userIndex = users.findIndex((user) => user.username.toLowerCase() === state.activeUser.toLowerCase());
  if (userIndex === -1) {
    return;
  }

  const existingData = users[userIndex].data && typeof users[userIndex].data === 'object' ? users[userIndex].data : {};
  users[userIndex].data = {
    ...existingData,
    dataVersion: 1,
    workouts: state.workouts,
    calendarEntries: state.calendarEntries,
    completedWorkoutDays: state.completedWorkoutDays,
    personalBests: state.personalBests,
    videoLibrary: stripVideoLibraryForPersistence(state.videoLibrary),
    activeSession: state.activeSession,
    selectedDay: state.selectedDay,
    currentDateIso: state.currentDate instanceof Date ? state.currentDate.toISOString() : null,
    weeklyWorkoutGoal: state.weeklyWorkoutGoal
  };
  setUsers(users);
}

function syncAuthUi() {
  const isLoggedIn = Boolean(state.activeUser);
  appContent?.classList.toggle('hidden', !isLoggedIn);
  authPanel?.classList.toggle('hidden', isLoggedIn);
  accountMenu?.classList.toggle('hidden', !isLoggedIn);
  accountDropdown?.classList.add('hidden');
  accountMenuButton?.setAttribute('aria-expanded', 'false');
  if (authStatusText) {
    if (isLoggedIn) {
      authStatusText.textContent = `Logged in as ${state.activeUser}. Your workouts and progress are saved on this browser.`;
    } else {
      authStatusText.textContent = 'Create an account or log in to save your workouts and progress.';
    }
  }
}

function toggleAccountDropdown() {
  if (!state.activeUser || !accountDropdown || !accountMenuButton) return;
  const nextOpen = accountDropdown.classList.contains('hidden');
  accountDropdown.classList.toggle('hidden', !nextOpen);
  accountMenuButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

function loadUserData(username) {
  const users = getUsers();
  const user = users.find((entry) => entry.username.toLowerCase() === String(username).toLowerCase());
  applyDataToState(user ? user.data : buildEmptyUserData());
  state.activeUser = username;
  localStorage.setItem(ACTIVE_USER_KEY, username);
  syncAuthUi();
}

function isUserDataEmpty(data) {
  if (!data || typeof data !== 'object') return true;
  const hasWorkouts = Array.isArray(data.workouts) && data.workouts.length > 0;
  const hasCalendar = data.calendarEntries && Object.keys(data.calendarEntries).length > 0;
  const hasCompleted = data.completedWorkoutDays && Object.keys(data.completedWorkoutDays).length > 0;
  const hasBests = data.personalBests && Object.keys(data.personalBests).length > 0;
  return !(hasWorkouts || hasCalendar || hasCompleted || hasBests);
}

function migrateLegacyProgressForUser(username) {
  const users = getUsers();
  const userIndex = users.findIndex((user) => user.username.toLowerCase() === String(username).toLowerCase());
  if (userIndex === -1) return;

  const existingData = users[userIndex].data || {};
  if (!isUserDataEmpty(existingData)) return;

  const legacyWorkouts = JSON.parse(localStorage.getItem('workouts') || '[]');
  const legacyCalendarEntries = JSON.parse(localStorage.getItem('calendarEntries') || '{}');
  const legacyCompletedWorkoutDays = JSON.parse(localStorage.getItem('completedWorkoutDays') || '{}');
  const legacyPersonalBests = JSON.parse(localStorage.getItem('personalBests') || '{}');

  const hasLegacyProgress =
    (Array.isArray(legacyWorkouts) && legacyWorkouts.length > 0) ||
    (legacyCalendarEntries && Object.keys(legacyCalendarEntries).length > 0) ||
    (legacyCompletedWorkoutDays && Object.keys(legacyCompletedWorkoutDays).length > 0) ||
    (legacyPersonalBests && Object.keys(legacyPersonalBests).length > 0);

  if (!hasLegacyProgress) return;

  users[userIndex].data = normalizeUserRecord({
    username: users[userIndex].username,
    password: users[userIndex].password,
    data: {
      ...existingData,
      workouts: Array.isArray(legacyWorkouts) ? legacyWorkouts : [],
      calendarEntries: legacyCalendarEntries && typeof legacyCalendarEntries === 'object' ? legacyCalendarEntries : {},
      completedWorkoutDays:
        legacyCompletedWorkoutDays && typeof legacyCompletedWorkoutDays === 'object' ? legacyCompletedWorkoutDays : {},
      personalBests: legacyPersonalBests && typeof legacyPersonalBests === 'object' ? legacyPersonalBests : {}
    }
  }).data;
  setUsers(users);
}

function requireAuth() {
  if (state.activeUser) return true;
  alert('Create an account or log in first.');
  return false;
}

function clearExistingCompletedChecksOnce() {
  const flagKey = 'clearedCompletedChecksOnce';
  if (localStorage.getItem(flagKey) === 'true') {
    return;
  }
  state.completedWorkoutDays = {};
  void saveState();
  localStorage.setItem(flagKey, 'true');
}

function formatDurationMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function launchConfetti() {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const colors = ['#22c55e', '#eab308', '#6366f1', '#ec4899', '#06b6d4', '#f97316', '#a855f7'];
  for (let i = 0; i < 72; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = `${2.2 + Math.random() * 2}s`;
    p.style.animationDelay = `${Math.random() * 0.35}s`;
    const w = 6 + Math.random() * 6;
    const h = 8 + Math.random() * 10;
    p.style.width = `${w}px`;
    p.style.height = `${h}px`;
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  setTimeout(() => layer.remove(), 4800);
}

function openWorkoutCompleteSummary(durationMs, pbMessages = []) {
  if (workoutDurationText) {
    workoutDurationText.textContent = `You finished in ${formatDurationMs(durationMs)}.`;
  }
  if (workoutPbList) {
    if (pbMessages.length === 0) {
      workoutPbList.innerHTML = '';
      workoutPbList.classList.add('hidden');
    } else {
      workoutPbList.classList.remove('hidden');
      workoutPbList.innerHTML = `<p class="pb-heading">New personal bests</p><ul class="pb-items">${pbMessages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
    }
  }
  workoutCompleteModal?.classList.remove('hidden');
}

function closeWorkoutCompleteSummary() {
  workoutCompleteModal?.classList.add('hidden');
  syncWeeklyGoalHud();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExerciseKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeWorkoutKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseWeightToNumber(weightStr) {
  if (weightStr == null) return null;
  const s = String(weightStr).trim();
  if (!s) return null;
  const m = s.match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function aggregateMaxFromEntry(entry) {
  const map = {};
  if (!entry || !Array.isArray(entry.exercises)) return map;

  function consider(displayName, repsStr, weightStr) {
    const key = normalizeExerciseKey(displayName);
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        displayName: String(displayName || '').trim() || 'Exercise',
        maxReps: 0,
        maxWeight: 0,
        topWeightSetReps: 0
      };
    }
    const r = parseInt(String(repsStr).trim(), 10);
    if (Number.isFinite(r) && r > map[key].maxReps) {
      map[key].maxReps = r;
    }
    const w = parseWeightToNumber(weightStr);
    if (w != null && (w > map[key].maxWeight || (w === map[key].maxWeight && r > map[key].topWeightSetReps))) {
      map[key].maxWeight = w;
      map[key].topWeightSetReps = Number.isFinite(r) ? r : 0;
    }
  }

  for (const block of entry.exercises) {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      for (const ex of block.exercises) {
        for (const log of ex.setLogs || []) {
          consider(ex.name, log.reps, log.weight);
        }
      }
    } else {
      for (const log of block.setLogs || []) {
        consider(block.name, log.reps, log.weight);
      }
    }
  }
  return map;
}

function updatePersonalBestsWithEntry(entry) {
  const workoutTitle = String(entry?.title || 'Untitled').trim() || 'Untitled';
  const workoutKey = normalizeWorkoutKey(workoutTitle) || 'untitled';
  const before = JSON.parse(JSON.stringify(state.personalBests?.[workoutKey] || {}));
  const workoutAgg = aggregateMaxFromEntry(entry);
  const messages = [];

  if (!state.personalBests[workoutKey]) {
    state.personalBests[workoutKey] = {
      title: workoutTitle,
      exercises: {}
    };
  }
  state.personalBests[workoutKey].title = workoutTitle;
  if (!state.personalBests[workoutKey].exercises || typeof state.personalBests[workoutKey].exercises !== 'object') {
    state.personalBests[workoutKey].exercises = {};
  }
  const group = state.personalBests[workoutKey].exercises;

  for (const key of Object.keys(workoutAgg)) {
    const agg = workoutAgg[key];
    const prev = before[key] || { maxReps: 0, maxWeight: 0, topWeightSetReps: 0 };
    const label = agg.displayName;

    if (agg.maxReps > 0 && prev.maxReps > 0 && agg.maxReps > prev.maxReps) {
      messages.push(`${label}: new best reps — ${agg.maxReps}`);
    }
    if (agg.maxWeight > 0 && prev.maxWeight > 0 && agg.maxWeight > prev.maxWeight) {
      messages.push(`${label}: new best weight — ${agg.maxWeight}`);
    }

    const nextReps = Math.max(prev.maxReps || 0, agg.maxReps || 0);
    const prevTopWeightSetReps = Number.isFinite(prev.topWeightSetReps) ? prev.topWeightSetReps : 0;
    const aggTopWeightSetReps = Number.isFinite(agg.topWeightSetReps) ? agg.topWeightSetReps : 0;
    const prevWeight = prev.maxWeight || 0;
    const aggWeight = agg.maxWeight || 0;

    let nextWt = prevWeight;
    let nextTopWeightSetReps = prevTopWeightSetReps;
    if (aggWeight > prevWeight || (aggWeight === prevWeight && aggTopWeightSetReps > prevTopWeightSetReps)) {
      nextWt = aggWeight;
      nextTopWeightSetReps = aggTopWeightSetReps;
    }

    if (!group[key]) {
      group[key] = { displayName: label, maxReps: 0, maxWeight: 0, topWeightSetReps: 0 };
    }
    group[key].displayName = label;
    group[key].maxReps = nextReps;
    group[key].maxWeight = nextWt;
    group[key].topWeightSetReps = nextTopWeightSetReps;
  }

  return messages;
}

function recomputePersonalBestsFromCalendar() {
  const nextBests = {};
  Object.keys(state.calendarEntries || {}).forEach((dateKey) => {
    const entries = state.calendarEntries[dateKey];
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      const workoutTitle = String(entry?.title || 'Untitled').trim() || 'Untitled';
      const workoutKey = normalizeWorkoutKey(workoutTitle) || 'untitled';
      if (!nextBests[workoutKey]) {
        nextBests[workoutKey] = {
          title: workoutTitle,
          exercises: {}
        };
      }
      const workoutAgg = aggregateMaxFromEntry(entry);
      Object.keys(workoutAgg).forEach((key) => {
        const agg = workoutAgg[key];
        if (!nextBests[workoutKey].exercises[key]) {
          nextBests[workoutKey].exercises[key] = {
            displayName: agg.displayName,
            maxReps: 0,
            maxWeight: 0,
            topWeightSetReps: 0
          };
        }
        const dest = nextBests[workoutKey].exercises[key];
        dest.displayName = agg.displayName;
        dest.maxReps = Math.max(dest.maxReps, agg.maxReps || 0);
        const aggWeight = agg.maxWeight || 0;
        const aggTopWeightSetReps = Number.isFinite(agg.topWeightSetReps) ? agg.topWeightSetReps : 0;
        if (aggWeight > dest.maxWeight || (aggWeight === dest.maxWeight && aggTopWeightSetReps > dest.topWeightSetReps)) {
          dest.maxWeight = aggWeight;
          dest.topWeightSetReps = aggTopWeightSetReps;
        }
      });
    });
  });
  state.personalBests = nextBests;
}

function formatExerciseLineTemplate(exercise) {
  return `${exercise.name} · ${exercise.sets} sets`;
}

function formatWorkoutDetails(workout) {
  if (Array.isArray(workout.exercises) && workout.exercises.length) {
    return workout.exercises
      .map((block) => {
        if (block.type === 'superset' && Array.isArray(block.exercises)) {
          const inner = block.exercises.map(formatExerciseLineTemplate).join(' + ');
          return `Superset: ${inner}`;
        }
        return formatExerciseLineTemplate(block);
      })
      .join('\n');
  }
  return workout.details || '';
}

function makeTemplateKey(workout) {
  return `${workout.title}\n${formatWorkoutDetails(workout)}`;
}

function formatDayExerciseLine(exercise) {
  const repsPart = exercise.reps ? ` · ${exercise.reps} reps` : '';
  const weightPart = exercise.weight ? ` · ${exercise.weight}` : '';
  return `${exercise.name} · ${exercise.sets} sets${repsPart}${weightPart}`;
}

function formatLoggedExercise(ex) {
  const name = ex.name || 'Exercise';
  if (Array.isArray(ex.setLogs) && ex.setLogs.length) {
    const lines = ex.setLogs.map((log, i) => {
      const r = log.reps ? `${log.reps} reps` : '—';
      const w = log.weight ? ` · ${log.weight}` : '';
      return `  Set ${i + 1}: ${r}${w}`;
    });
    return `${name}\n${lines.join('\n')}`;
  }
  return formatDayExerciseLine(ex);
}

function formatDayEntryDetails(entry) {
  if (Array.isArray(entry.exercises) && entry.exercises.length) {
    return entry.exercises
      .map((block) => {
        if (block.type === 'superset' && Array.isArray(block.exercises)) {
          const inner = block.exercises.map((ex) => formatLoggedExercise(ex)).join('\n\n');
          return `Superset:\n${inner.split('\n').map((line) => `  ${line}`).join('\n')}`;
        }
        return formatLoggedExercise(block);
      })
      .join('\n\n');
  }
  return entry.details || '';
}

function createExerciseRow(exercise = {}) {
  const row = document.createElement('div');
  row.className = 'exercise-row';

  const nameInput = document.createElement('input');
  nameInput.className = 'exercise-name';
  nameInput.placeholder = 'Exercise name';
  nameInput.value = exercise.name || '';

  const grid = document.createElement('div');
  grid.className = 'field-grid field-grid-template';

  const setsInput = document.createElement('input');
  setsInput.className = 'exercise-sets';
  setsInput.type = 'number';
  setsInput.min = '1';
  setsInput.placeholder = 'Sets';
  setsInput.value = exercise.sets || '';

  grid.append(setsInput);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-exercise';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    row.remove();
  });

  row.append(nameInput, grid, removeButton);
  return row;
}

function createSupersetBlock(superset = {}) {
  const exercises = Array.isArray(superset.exercises) && superset.exercises.length ? superset.exercises : [{}, {}];

  const block = document.createElement('div');
  block.className = 'superset-block';

  const header = document.createElement('div');
  header.className = 'superset-header';
  const label = document.createElement('span');
  label.className = 'superset-label';
  label.textContent = 'Superset';
  header.appendChild(label);

  const inner = document.createElement('div');
  inner.className = 'superset-exercises';
  exercises.forEach((ex) => inner.appendChild(createExerciseRow(ex)));

  const actions = document.createElement('div');
  actions.className = 'superset-actions';
  const addInner = document.createElement('button');
  addInner.type = 'button';
  addInner.className = 'secondary-btn';
  addInner.textContent = 'Add exercise to superset';
  addInner.addEventListener('click', () => inner.appendChild(createExerciseRow()));
  const removeBlock = document.createElement('button');
  removeBlock.type = 'button';
  removeBlock.className = 'remove-exercise';
  removeBlock.textContent = 'Remove superset';
  removeBlock.addEventListener('click', () => block.remove());
  actions.append(addInner, removeBlock);

  block.append(header, inner, actions);
  return block;
}

function plannedSetCount(raw) {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function buildSessionBlocks(saved) {
  return saved.exercises.map((block) => {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      return {
        type: 'superset',
        exercises: block.exercises.map((ex) => {
          const plannedSets = plannedSetCount(ex.sets);
          return {
            name: ex.name,
            plannedSets,
            setLogs: Array.from({ length: plannedSets }, () => ({ reps: '', weight: '' }))
          };
        })
      };
    }
    const plannedSets = plannedSetCount(block.sets);
    return {
      name: block.name,
      plannedSets,
      setLogs: Array.from({ length: plannedSets }, () => ({ reps: '', weight: '' }))
    };
  });
}

function switchTab(target) {
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === target);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === target);
  });
  if (target === 'completed-workouts') {
    renderCompletedWorkoutsTab();
  }
  if (target === 'progress') {
    renderPersonalBestsTab();
  }
  if (target === 'videos') {
    void renderVideosTab();
  }
}

async function renderVideosTab() {
  if (!videosRoot) return;
  videosRoot.innerHTML = '';
  revokeAllVideoPlaybackObjectUrls();
  const allVideos = [];
  Object.values(state.videoLibrary || {}).forEach((group) => {
    (group.videos || []).forEach((video) => {
      allVideos.push(video);
    });
  });

  if (allVideos.length === 0) {
    videosRoot.innerHTML = '<p class="muted">No videos yet. Record one from Active workout.</p>';
    return;
  }

  const byDate = {};
  allVideos.forEach((item) => {
    const key = item.dayKey || item.dateLabel || 'Unknown date';
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(item);
  });

  const hydrationPromises = [];

  Object.keys(byDate)
    .sort((a, b) => b.localeCompare(a))
    .forEach((dayKey) => {
      const dayVideos = byDate[dayKey].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const dayDetails = document.createElement('details');
      dayDetails.className = 'video-day-group';

      const summary = document.createElement('summary');
      summary.className = 'video-day-summary';
      const dateText = dayVideos[0]?.dateLabel || dayKey;
      const workoutTitle = String(dayVideos[0]?.workoutTitle || '').trim();
      const headerLabel = workoutTitle ? `${dateText} - ${workoutTitle}` : dateText;
      summary.innerHTML = `${escapeHtml(headerLabel)}<span class="video-day-count">${dayVideos.length}</span>`;

      const body = document.createElement('div');
      body.className = 'video-list';

      dayVideos.forEach((item) => {
        const vCard = document.createElement('div');
        vCard.className = 'video-item';
        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'secondary-btn video-item-toggle';
        const setNum = Number.isFinite(item.setIndex) ? item.setIndex + 1 : 1;
        const labelExercise = item.exerciseName || 'Exercise';
        toggleButton.textContent = `${labelExercise} - Set ${setNum}`;

        const video = document.createElement('video');
        video.className = 'hidden';
        video.controls = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('preload', 'metadata');

        hydrationPromises.push(
          resolveVideoItemPlaybackUrl(item).then((src) => {
            if (src) {
              video.src = src;
            } else {
              const err = document.createElement('p');
              err.className = 'muted';
              err.textContent =
                'This clip cannot be played. It may have been saved in an old format, or browser storage was cleared.';
              vCard.appendChild(err);
            }
          })
        );

        toggleButton.addEventListener('click', () => {
          const isHidden = video.classList.contains('hidden');
          video.classList.toggle('hidden', !isHidden);
          toggleButton.textContent = isHidden
            ? `${labelExercise} - Set ${setNum} (Hide)`
            : `${labelExercise} - Set ${setNum}`;
        });

        vCard.append(toggleButton, video);
        body.appendChild(vCard);
      });

      dayDetails.append(summary, body);
      videosRoot.appendChild(dayDetails);
    });

  await Promise.all(hydrationPromises);
}

function collectWorkoutExerciseNames(workout) {
  if (!workout || !Array.isArray(workout.exercises)) return [];
  const names = [];
  workout.exercises.forEach((block) => {
    if (block?.type === 'superset' && Array.isArray(block.exercises)) {
      block.exercises.forEach((ex) => {
        const label = String(ex?.name || '').trim();
        if (label) names.push(label);
      });
      return;
    }
    const label = String(block?.name || '').trim();
    if (label) names.push(label);
  });
  return names;
}

function resetPersonalBestForExercise(workoutKey, exerciseKey) {
  if (!requireAuth()) return;
  const workoutGroup = state.personalBests?.[workoutKey];
  const exercise = workoutGroup?.exercises?.[exerciseKey];
  if (!workoutGroup || !exercise) return;
  const exerciseName = exercise.displayName || exerciseKey;
  const ok = confirm(`Reset personal best for "${exerciseName}" in "${workoutGroup.title}"?`);
  if (!ok) return;

  delete workoutGroup.exercises[exerciseKey];
  if (Object.keys(workoutGroup.exercises).length === 0) {
    delete state.personalBests[workoutKey];
  }

  saveState();
  renderPersonalBestsTab();
}

function collectCalendarEntriesSorted() {
  const items = [];
  Object.entries(state.calendarEntries || {}).forEach(([dateKey, entries]) => {
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      items.push({ dateKey, entry });
    });
  });
  items.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return items;
}

function buildProgressOverview(entries) {
  const totalSessions = entries.length;
  const dayMs = 24 * 60 * 60 * 1000;
  const recentCutoff = Date.now() - 30 * dayMs;
  let recentSessions = 0;
  const activeWeeks = new Set();

  entries.forEach(({ dateKey, entry }) => {
    const dateObj = parseDateKey(dateKey);
    if (dateObj && dateObj.getTime() >= recentCutoff) {
      recentSessions += 1;
    }
    if (dateObj) {
      const weekStart = new Date(dateObj);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      activeWeeks.add(formatDate(weekStart));
    }
  });

  const avgPerWeek = activeWeeks.size ? (totalSessions / activeWeeks.size).toFixed(1) : '0.0';
  return {
    totalSessions,
    recentSessions,
    avgPerWeek
  };
}

function buildProgressMilestones(entries) {
  const bestByExercise = {};
  const milestones = [];

  entries.forEach(({ dateKey, entry }) => {
    const agg = aggregateMaxFromEntry(entry);
    Object.values(agg).forEach((exAgg) => {
      const key = normalizeExerciseKey(exAgg.displayName);
      if (!key) return;
      const prev = bestByExercise[key] || { maxWeight: 0 };
      const nextWeight = Number.isFinite(exAgg.maxWeight) ? exAgg.maxWeight : 0;

      if (nextWeight > prev.maxWeight) {
        milestones.push({
          dateKey,
          text: `${exAgg.displayName}: new weight best ${nextWeight} lb`
        });
      }

      bestByExercise[key] = {
        maxWeight: Math.max(prev.maxWeight, nextWeight)
      };
    });
  });

  return milestones.reverse();
}

function buildExerciseTrendCards(entries, limit = 6) {
  const byExercise = {};
  entries.forEach(({ dateKey, entry }) => {
    const agg = aggregateMaxFromEntry(entry);
    Object.values(agg).forEach((exAgg) => {
      const key = normalizeExerciseKey(exAgg.displayName);
      if (!key) return;
      if (!byExercise[key]) {
        byExercise[key] = {
          name: exAgg.displayName,
          points: []
        };
      }
      const w = Number.isFinite(exAgg.maxWeight) ? exAgg.maxWeight : 0;
      byExercise[key].points.push({ dateKey, weight: w });
    });
  });

  return Object.values(byExercise)
    .map((item) => {
      const sorted = item.points.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
      const first = sorted[0]?.weight || 0;
      const last = sorted[sorted.length - 1]?.weight || 0;
      return {
        name: item.name,
        sessions: sorted.length,
        startWeight: first,
        currentWeight: last,
        delta: last - first
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSundayEnd(d = new Date()) {
  const mon = startOfWeekMonday(d);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
}

function countSessionsInCurrentWeek(entries) {
  const start = startOfWeekMonday(new Date());
  const end = endOfWeekSundayEnd(new Date());
  let n = 0;
  for (let i = 0; i < entries.length; i++) {
    const dt = parseDateKey(entries[i].dateKey);
    if (!dt) continue;
    if (dt.getTime() >= start.getTime() && dt.getTime() <= end.getTime()) {
      n += 1;
    }
  }
  return n;
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function weeklyGoalMeterRgb(ratio) {
  const r = Math.min(1, Math.max(0, ratio));
  const positions = [0, 0.33, 0.66, 1];
  const colors = [
    [239, 68, 68],
    [249, 115, 22],
    [234, 179, 8],
    [34, 197, 94]
  ];
  let i = 0;
  while (i < positions.length - 1 && r > positions[i + 1]) {
    i += 1;
  }
  const span = positions[i + 1] - positions[i] || 1;
  const t = (r - positions[i]) / span;
  const c0 = colors[i];
  const c1 = colors[i + 1];
  return `rgb(${lerpChannel(c0[0], c1[0], t)}, ${lerpChannel(c0[1], c1[1], t)}, ${lerpChannel(c0[2], c1[2], t)})`;
}

function appendWeeklyGoalConsistencySection(root, entries) {
  const weekCount = countSessionsInCurrentWeek(entries);
  const goal = state.weeklyWorkoutGoal;
  const ratio = goal != null && goal > 0 ? weekCount / goal : 0;

  const section = document.createElement('section');
  section.className = 'progress-consistency progress-section-card';

  const h4 = document.createElement('h4');
  h4.textContent = 'Weekly goal';
  section.appendChild(h4);

  const row = document.createElement('div');
  row.className = 'progress-weekly-goal-row';

  const settings = document.createElement('div');
  settings.className = 'progress-weekly-goal-settings';
  const lab = document.createElement('label');
  lab.htmlFor = 'weekly-goal-input';
  lab.textContent = 'Target workouts per week';
  const inputRow = document.createElement('div');
  inputRow.className = 'progress-weekly-goal-input-row';
  const inp = document.createElement('input');
  inp.id = 'weekly-goal-input';
  inp.type = 'number';
  inp.min = '1';
  inp.max = '14';
  inp.setAttribute('inputmode', 'numeric');
  inp.value = goal != null ? String(goal) : '';
  inp.placeholder = 'e.g. 4';
  inp.addEventListener('change', () => {
    if (!requireAuth()) return;
    const raw = inp.value.trim();
    if (raw === '') {
      state.weeklyWorkoutGoal = null;
    } else {
      const n = parseInt(raw, 10);
      state.weeklyWorkoutGoal = Number.isFinite(n) && n >= 1 ? Math.min(14, n) : null;
    }
    void saveState();
    renderPersonalBestsTab();
  });
  inputRow.appendChild(inp);
  settings.appendChild(lab);
  settings.appendChild(inputRow);

  const meter = document.createElement('div');
  meter.id = 'weekly-goal-meter-widget';
  meter.className = 'progress-weekly-goal-meter';
  meter.setAttribute('role', 'status');
  meter.setAttribute('aria-live', 'polite');
  meter.setAttribute(
    'aria-label',
    goal != null && goal > 0
      ? `${weekCount} of ${goal} workouts completed this week`
      : `${weekCount} workouts logged this week`
  );
  const bg =
    goal != null && goal > 0 ? weeklyGoalMeterRgb(Math.min(1, ratio)) : 'rgb(148, 163, 184)';
  meter.style.background = bg;
  meter.style.color = '#ffffff';

  const countEl = document.createElement('span');
  countEl.id = 'weekly-goal-count-live';
  countEl.className = 'progress-weekly-goal-count';
  countEl.textContent = String(weekCount);

  const slash = document.createElement('span');
  slash.className = 'progress-weekly-goal-slash';
  slash.textContent = '/';

  const targetEl = document.createElement('span');
  targetEl.id = 'weekly-goal-target-live';
  targetEl.className = 'progress-weekly-goal-target';
  targetEl.textContent = goal != null && goal > 0 ? String(goal) : '—';

  meter.append(countEl, slash, targetEl);

  row.append(settings, meter);
  section.appendChild(row);

  const hint = document.createElement('p');
  hint.className = 'muted progress-weekly-goal-hint';
  hint.textContent =
    'Counter is completed workouts this calendar week (Mon–Sun). It goes up each time you finish a workout.';
  section.appendChild(hint);

  root.appendChild(section);
}

function syncWeeklyGoalHud() {
  const entries = collectCalendarEntriesSorted();
  const weekCount = countSessionsInCurrentWeek(entries);
  const goal = state.weeklyWorkoutGoal;
  const ratio = goal != null && goal > 0 ? weekCount / goal : 0;

  const meter = document.getElementById('weekly-goal-meter-widget');
  const countEl = document.getElementById('weekly-goal-count-live');
  const targetEl = document.getElementById('weekly-goal-target-live');
  if (meter && countEl && targetEl) {
    countEl.textContent = String(weekCount);
    targetEl.textContent = goal != null && goal > 0 ? String(goal) : '—';
    const bg =
      goal != null && goal > 0 ? weeklyGoalMeterRgb(Math.min(1, ratio)) : 'rgb(148, 163, 184)';
    meter.style.background = bg;
    meter.style.color = '#ffffff';
    meter.setAttribute(
      'aria-label',
      goal != null && goal > 0
        ? `${weekCount} of ${goal} workouts completed this week`
        : `${weekCount} workouts logged this week`
    );
  }

  const badge = document.getElementById('weekly-goal-tab-badge');
  if (badge) {
    if (goal != null && goal > 0) {
      badge.textContent = `${weekCount}/${goal}`;
      badge.classList.remove('hidden');
    } else if (weekCount > 0) {
      badge.textContent = String(weekCount);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }
}

function renderPersonalBestsTab() {
  const root = document.getElementById('personal-bests-root');
  if (!root) return;

  root.innerHTML = '';
  const entries = collectCalendarEntriesSorted();
  const overview = buildProgressOverview(entries);
  const milestones = buildProgressMilestones(entries);
  const trendCards = buildExerciseTrendCards(entries);

  const insights = document.createElement('section');
  insights.className = 'progress-insights progress-section-card';
  insights.innerHTML = `
    <div class="progress-stat-card"><span>Total sessions</span><strong>${overview.totalSessions}</strong></div>
    <div class="progress-stat-card"><span>Last 30 days</span><strong>${overview.recentSessions}</strong></div>
    <div class="progress-stat-card"><span>Sessions/week</span><strong>${overview.avgPerWeek}</strong></div>
  `;
  root.appendChild(insights);

  appendWeeklyGoalConsistencySection(root, entries);

  const trendsSection = document.createElement('section');
  trendsSection.className = 'progress-trends progress-section-card';
  const trendsTitle = document.createElement('h4');
  trendsTitle.textContent = 'Exercise trends';
  trendsSection.appendChild(trendsTitle);
  if (!trendCards.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Log more workouts to unlock trend cards.';
    trendsSection.appendChild(empty);
  } else {
    const cards = document.createElement('div');
    cards.className = 'progress-trend-grid';
    trendCards.forEach((card) => {
      const deltaSign = card.delta > 0 ? '+' : '';
      const el = document.createElement('article');
      el.className = 'progress-trend-card';
      el.innerHTML = `<h5>${escapeHtml(card.name)}</h5><p>Sessions: ${card.sessions}</p><p>Start: ${card.startWeight} lb</p><p>Current: ${card.currentWeight} lb</p><p class="progress-delta">Change: ${deltaSign}${card.delta} lb</p>`;
      cards.appendChild(el);
    });
    trendsSection.appendChild(cards);
  }
  root.appendChild(trendsSection);

  const milestonesSection = document.createElement('section');
  milestonesSection.className = 'progress-milestones progress-section-card';
  const milestoneTitle = document.createElement('h4');
  milestoneTitle.textContent = 'Recent milestones';
  milestonesSection.appendChild(milestoneTitle);
  if (!milestones.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Complete workouts to generate milestones.';
    milestonesSection.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'progress-milestone-list';
    const visibleMilestones = milestones.slice(0, 5);
    const hiddenMilestones = milestones.slice(5);

    visibleMilestones.forEach((m) => {
      const d = parseDateKey(m.dateKey);
      const dateLabel = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : m.dateKey;
      const row = document.createElement('div');
      row.className = 'progress-milestone-item';
      row.innerHTML = `<span class="progress-milestone-date">${dateLabel}</span><span>${escapeHtml(m.text)}</span>`;
      list.appendChild(row);
    });
    milestonesSection.appendChild(list);

    if (hiddenMilestones.length) {
      const moreWrap = document.createElement('details');
      moreWrap.className = 'progress-milestones-more';
      const summary = document.createElement('summary');
      summary.textContent = `Show older milestones (${hiddenMilestones.length})`;
      moreWrap.appendChild(summary);

      const olderList = document.createElement('div');
      olderList.className = 'progress-milestone-list';
      hiddenMilestones.forEach((m) => {
        const d = parseDateKey(m.dateKey);
        const dateLabel = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : m.dateKey;
        const row = document.createElement('div');
        row.className = 'progress-milestone-item';
        row.innerHTML = `<span class="progress-milestone-date">${dateLabel}</span><span>${escapeHtml(m.text)}</span>`;
        olderList.appendChild(row);
      });
      moreWrap.appendChild(olderList);
      milestonesSection.appendChild(moreWrap);
    }
  }
  root.appendChild(milestonesSection);

  syncWeeklyGoalHud();
}


function beginWorkoutSession(savedIndex) {
  if (!requireAuth()) return;
  if (!state.selectedDay) {
    alert('Pick a day first.');
    return;
  }
  const saved = state.workouts[savedIndex];
  if (!saved || !Array.isArray(saved.exercises) || saved.exercises.length === 0) {
    alert('That workout has no exercises.');
    return;
  }

  state.activeSession = {
    savedWorkoutIndex: savedIndex,
    dayKey: state.selectedDay,
    title: saved.title,
    templateKey: makeTemplateKey(saved),
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    blocks: buildSessionBlocks(saved),
    startedAt: Date.now()
  };

  saveState();
  renderActiveWorkoutPanel();
  switchTab('active-workout');
}

function clearActiveSession() {
  state.activeSession = null;
  saveState();
  renderActiveWorkoutPanel();
}

function appendActiveSetRow(container, bi, ej, setIndex, exerciseName, existingLog = null) {
  const row = document.createElement('div');
  row.className = 'active-set-row';
  row.dataset.bi = String(bi);
  row.dataset.ej = ej === -1 ? '-1' : String(ej);
  row.dataset.si = String(setIndex);

  const label = document.createElement('span');
  label.className = 'active-set-label';
  label.textContent = `Set ${setIndex + 1}`;

  const reps = document.createElement('input');
  reps.type = 'number';
  reps.min = '1';
  reps.className = 'active-reps';
  reps.placeholder = 'Reps';
  reps.setAttribute('aria-label', `Reps ${exerciseName} set ${setIndex + 1}`);
  reps.value = existingLog?.reps || '';

  const weight = document.createElement('input');
  weight.type = 'text';
  weight.className = 'active-weight';
  weight.placeholder = 'Weight (optional)';
  weight.setAttribute('aria-label', `Weight ${exerciseName} set ${setIndex + 1}`);
  weight.value = existingLog?.weight || '';

  const videoButton = document.createElement('button');
  videoButton.type = 'button';
  videoButton.className = 'secondary-btn take-video-btn';
  videoButton.textContent = 'Take Video';
  videoButton.addEventListener('click', () => {
    openVideoCaptureForSet({ bi, ej, si: setIndex, exerciseName });
  });

  row.append(label, reps, weight, videoButton);
  container.appendChild(row);
}

function getVideoDateLabel() {
  const now = new Date();
  return now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function stopActiveVideoStream() {
  if (!activeVideoStream) return;
  activeVideoStream.getTracks().forEach((t) => t.stop());
  activeVideoStream = null;
}

async function startVideoPreviewStream() {
  stopActiveVideoStream();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: videoFacingMode },
    audio: true
  });
  activeVideoStream = stream;
  if (videoPreview) {
    videoPreview.srcObject = stream;
  }
}

function closeVideoCaptureModal() {
  if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
    activeMediaRecorder.stop();
  }
  stopActiveVideoStream();
  activeMediaRecorder = null;
  activeVideoChunks = [];
  activeVideoContext = null;
  if (recordVideoButton) {
    recordVideoButton.classList.remove('recording');
  }
  if (videoCaptureModal) {
    videoCaptureModal.classList.add('hidden');
  }
}

async function addVideoToLibrary(context, blob) {
  const exerciseName = context?.exerciseName || 'Exercise';
  const key = normalizeExerciseKey(exerciseName) || 'exercise';
  if (!state.videoLibrary[key]) {
    state.videoLibrary[key] = {
      exerciseName,
      videos: []
    };
  }
  if (!state.activeUser) {
    return;
  }
  const blobKey = `${safeUserSegmentForBlobKey(state.activeUser)}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  try {
    await storeVideoClipBlob(blobKey, blob);
  } catch (err) {
    console.error(err);
    alert('Could not save the video to browser storage. Check that this site can use storage, then try again.');
    return;
  }
  const dayKey = state.activeSession?.dayKey || '';
  const localDate = dayKey ? parseDateKey(dayKey) : new Date();
  const dateLabel = localDate
    ? localDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : getVideoDateLabel();
  const workoutTitle = String(state.activeSession?.title || '').trim();
  const sessionId = String(state.activeSession?.sessionId || '');
  state.videoLibrary[key].videos.push({
    blobKey,
    dateLabel,
    dayKey,
    workoutTitle,
    sessionId,
    exerciseName,
    setIndex: Number.isFinite(context?.si) ? context.si : 0,
    timestamp: Date.now()
  });
  saveState();
  await renderVideosTab();
}

function purgeVideosWhere(predicate) {
  Object.keys(state.videoLibrary || {}).forEach((groupKey) => {
    const group = state.videoLibrary[groupKey];
    if (!group || !Array.isArray(group.videos)) return;
    const kept = [];
    group.videos.forEach((video) => {
      if (predicate(video)) {
        if (typeof video?.blobKey === 'string' && video.blobKey.trim()) {
          void deleteVideoClipBlob(video.blobKey.trim());
        }
        if (video?.url && String(video.url).startsWith('blob:')) {
          try {
            URL.revokeObjectURL(video.url);
          } catch (_) {
            /* ignore */
          }
        }
      } else {
        kept.push(video);
      }
    });
    if (kept.length === 0) {
      delete state.videoLibrary[groupKey];
    } else {
      group.videos = kept;
    }
  });
}

function removeVideosForCalendarEntry(dayKey, entry) {
  if (!entry) return;
  const sessionId = String(entry.sessionId || '');
  const title = String(entry.title || '').trim();
  purgeVideosWhere((video) => {
    if (!video) return false;
    if (String(video.dayKey || '') !== String(dayKey || '')) return false;
    if (sessionId && String(video.sessionId || '') === sessionId) return true;
    if (title && String(video.workoutTitle || '') === title) return true;
    return false;
  });
}

async function openVideoCaptureForSet(context) {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('Video capture is not supported in this browser.');
    return;
  }
  activeVideoContext = context;
  videoFacingMode = 'environment';
  if (videoCaptureStatus) {
    videoCaptureStatus.textContent = `Recording for ${context.exerciseName}, set ${context.si + 1}.`;
  }
  if (recordVideoButton) {
    recordVideoButton.classList.remove('recording');
  }
  videoCaptureModal?.classList.remove('hidden');
  try {
    await startVideoPreviewStream();
  } catch (error) {
    videoCaptureModal?.classList.add('hidden');
    alert('Unable to access camera/microphone.');
  }
}

async function switchCaptureCamera() {
  videoFacingMode = videoFacingMode === 'environment' ? 'user' : 'environment';
  try {
    await startVideoPreviewStream();
  } catch (error) {
    videoFacingMode = videoFacingMode === 'environment' ? 'user' : 'environment';
    alert('Unable to switch camera.');
  }
}

function toggleVideoRecording() {
  if (!activeVideoStream) return;
  if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
    activeMediaRecorder.stop();
    return;
  }
  activeVideoChunks = [];
  try {
    activeMediaRecorder = new MediaRecorder(activeVideoStream);
  } catch (error) {
    alert('Recording is not available.');
    return;
  }
  activeMediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      activeVideoChunks.push(event.data);
    }
  };
  activeMediaRecorder.onstop = () => {
    if (recordVideoButton) {
      recordVideoButton.classList.remove('recording');
    }
    const blob = new Blob(activeVideoChunks, { type: 'video/webm' });
    if (blob.size > 0 && activeVideoContext) {
      void addVideoToLibrary(activeVideoContext, blob)
        .then(() => switchTab('videos'))
        .catch(() => {});
    }
    closeVideoCaptureModal();
  };
  activeMediaRecorder.start();
  if (recordVideoButton) {
    recordVideoButton.classList.add('recording');
  }
}

function syncActiveSessionSetLogsFromDom() {
  if (!state.activeSession || !activeWorkoutRoot) return;
  const root = activeWorkoutRoot;

  state.activeSession.blocks.forEach((block, bi) => {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      block.exercises.forEach((ex, ej) => {
        const nextLogs = [];
        for (let si = 0; si < ex.plannedSets; si++) {
          const row = root.querySelector(`[data-bi="${bi}"][data-ej="${ej}"][data-si="${si}"]`);
          if (!row) {
            nextLogs.push(ex.setLogs?.[si] || { reps: '', weight: '' });
            continue;
          }
          nextLogs.push({
            reps: row.querySelector('.active-reps')?.value.trim() || '',
            weight: row.querySelector('.active-weight')?.value.trim() || ''
          });
        }
        ex.setLogs = nextLogs;
      });
      return;
    }

    const nextLogs = [];
    for (let si = 0; si < block.plannedSets; si++) {
      const row = root.querySelector(`[data-bi="${bi}"][data-ej="-1"][data-si="${si}"]`);
      if (!row) {
        nextLogs.push(block.setLogs?.[si] || { reps: '', weight: '' });
        continue;
      }
      nextLogs.push({
        reps: row.querySelector('.active-reps')?.value.trim() || '',
        weight: row.querySelector('.active-weight')?.value.trim() || ''
      });
    }
    block.setLogs = nextLogs;
  });
}

function replaceActiveExerciseName(bi, ej) {
  if (!state.activeSession) return;
  syncActiveSessionSetLogsFromDom();

  let targetExercise = null;
  if (ej >= 0) {
    const superset = state.activeSession.blocks[bi];
    if (superset?.type === 'superset' && Array.isArray(superset.exercises)) {
      targetExercise = superset.exercises[ej] || null;
    }
  } else {
    targetExercise = state.activeSession.blocks[bi] || null;
  }
  if (!targetExercise) return;

  const currentName = String(targetExercise.name || '').trim() || 'Exercise';
  const nextName = prompt('Change workout', currentName);
  if (nextName == null) return;
  const trimmed = nextName.trim();
  if (!trimmed) {
    alert('Enter a workout name to replace with.');
    return;
  }
  targetExercise.name = trimmed;
  renderActiveWorkoutPanel();
}

function getActiveExerciseRef(bi, ej) {
  if (!state.activeSession) return null;
  if (ej >= 0) {
    const superset = state.activeSession.blocks[bi];
    if (superset?.type === 'superset' && Array.isArray(superset.exercises)) {
      return superset.exercises[ej] || null;
    }
    return null;
  }
  return state.activeSession.blocks[bi] || null;
}

function adjustActiveExerciseSets(bi, ej, delta) {
  if (!state.activeSession) return;
  syncActiveSessionSetLogsFromDom();
  const exercise = getActiveExerciseRef(bi, ej);
  if (!exercise) return;

  const nextPlannedSets = Math.max(1, (exercise.plannedSets || 1) + delta);
  if (nextPlannedSets === exercise.plannedSets) return;
  exercise.plannedSets = nextPlannedSets;

  if (!Array.isArray(exercise.setLogs)) {
    exercise.setLogs = [];
  }
  while (exercise.setLogs.length < nextPlannedSets) {
    exercise.setLogs.push({ reps: '', weight: '' });
  }
  if (exercise.setLogs.length > nextPlannedSets) {
    exercise.setLogs = exercise.setLogs.slice(0, nextPlannedSets);
  }

  renderActiveWorkoutPanel();
}

function renderActiveWorkoutPanel() {
  if (!activeWorkoutRoot) return;

  activeWorkoutRoot.innerHTML = '';

  if (!state.activeSession) {
    activeWorkoutTitle.textContent = 'No workout in progress';
    activeWorkoutDateLine.textContent = '';
    activeWorkoutDateLine.classList.add('muted');
    activeWorkoutRoot.innerHTML =
      '<p class="muted">Select a day on the Calendar tab, pick a saved workout, and press <strong>Start</strong> (or use <strong>Start on selected day</strong> from Workouts).</p>';
    activeWorkoutActions.classList.add('hidden');
    return;
  }

  activeWorkoutDateLine.classList.remove('muted');
  const { title, dayKey, blocks } = state.activeSession;
  activeWorkoutTitle.textContent = title;
  const local = parseDateKey(dayKey);
  activeWorkoutDateLine.textContent = local
    ? local.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : dayKey;
  activeWorkoutActions.classList.remove('hidden');

  blocks.forEach((block, bi) => {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      const wrap = document.createElement('div');
      wrap.className = 'active-superset-wrap';

      const banner = document.createElement('div');
      banner.className = 'start-superset-banner';
      banner.textContent = 'Superset';
      wrap.appendChild(banner);

      block.exercises.forEach((ex, ej) => {
        const card = document.createElement('div');
        card.className = 'active-exercise-card';

        const head = document.createElement('div');
        head.className = 'active-exercise-head';
        const h = document.createElement('h4');
        h.textContent = ex.name || `Exercise ${ej + 1}`;
        const replaceButton = document.createElement('button');
        replaceButton.type = 'button';
        replaceButton.className = 'secondary-btn';
        replaceButton.textContent = 'Replace';
        replaceButton.addEventListener('click', () => replaceActiveExerciseName(bi, ej));
        head.append(h, replaceButton);
        card.appendChild(head);
        for (let si = 0; si < ex.plannedSets; si++) {
          appendActiveSetRow(card, bi, ej, si, ex.name || '', ex.setLogs?.[si] || null);
        }
        const setActions = document.createElement('div');
        setActions.className = 'active-set-actions';
        const addSetButton = document.createElement('button');
        addSetButton.type = 'button';
        addSetButton.className = 'secondary-btn';
        addSetButton.textContent = '+';
        addSetButton.setAttribute('aria-label', `Add set for ${ex.name || `exercise ${ej + 1}`}`);
        addSetButton.addEventListener('click', () => adjustActiveExerciseSets(bi, ej, 1));
        const removeSetButton = document.createElement('button');
        removeSetButton.type = 'button';
        removeSetButton.className = 'secondary-btn';
        removeSetButton.textContent = '-';
        removeSetButton.setAttribute('aria-label', `Remove set for ${ex.name || `exercise ${ej + 1}`}`);
        removeSetButton.addEventListener('click', () => adjustActiveExerciseSets(bi, ej, -1));
        setActions.append(addSetButton, removeSetButton);
        card.appendChild(setActions);
        wrap.appendChild(card);
      });

      activeWorkoutRoot.appendChild(wrap);
    } else {
      const card = document.createElement('div');
      card.className = 'active-exercise-card';

      const head = document.createElement('div');
      head.className = 'active-exercise-head';
      const h = document.createElement('h4');
      h.textContent = block.name || 'Exercise';
      const replaceButton = document.createElement('button');
      replaceButton.type = 'button';
      replaceButton.className = 'secondary-btn';
      replaceButton.textContent = 'Replace';
      replaceButton.addEventListener('click', () => replaceActiveExerciseName(bi, -1));
      head.append(h, replaceButton);
      card.appendChild(head);
      for (let si = 0; si < block.plannedSets; si++) {
        appendActiveSetRow(card, bi, -1, si, block.name || '', block.setLogs?.[si] || null);
      }
      const setActions = document.createElement('div');
      setActions.className = 'active-set-actions';
      const addSetButton = document.createElement('button');
      addSetButton.type = 'button';
      addSetButton.className = 'secondary-btn';
      addSetButton.textContent = '+';
      addSetButton.setAttribute('aria-label', `Add set for ${block.name || 'exercise'}`);
      addSetButton.addEventListener('click', () => adjustActiveExerciseSets(bi, -1, 1));
      const removeSetButton = document.createElement('button');
      removeSetButton.type = 'button';
      removeSetButton.className = 'secondary-btn';
      removeSetButton.textContent = '-';
      removeSetButton.setAttribute('aria-label', `Remove set for ${block.name || 'exercise'}`);
      removeSetButton.addEventListener('click', () => adjustActiveExerciseSets(bi, -1, -1));
      setActions.append(addSetButton, removeSetButton);
      card.appendChild(setActions);
      activeWorkoutRoot.appendChild(card);
    }
  });

  activeWorkoutRoot.querySelector('.active-reps')?.focus();
}

function readActiveSessionEntryFromDom() {
  if (!state.activeSession || !activeWorkoutRoot) return null;

  const root = activeWorkoutRoot;
  const exercises = state.activeSession.blocks.map((block, bi) => {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      return {
        type: 'superset',
        exercises: block.exercises.map((ex, ej) => {
          const setLogs = [];
          for (let si = 0; si < ex.plannedSets; si++) {
            const row = root.querySelector(`[data-bi="${bi}"][data-ej="${ej}"][data-si="${si}"]`);
            if (!row) continue;
            const reps = row.querySelector('.active-reps')?.value.trim() || '';
            const weight = row.querySelector('.active-weight')?.value.trim() || '';
            setLogs.push({ reps, weight });
          }
          return {
            name: ex.name,
            sets: ex.plannedSets,
            setLogs
          };
        })
      };
    }

    const setLogs = [];
    for (let si = 0; si < block.plannedSets; si++) {
      const row = root.querySelector(`[data-bi="${bi}"][data-ej="-1"][data-si="${si}"]`);
      if (!row) continue;
      const reps = row.querySelector('.active-reps')?.value.trim() || '';
      const weight = row.querySelector('.active-weight')?.value.trim() || '';
      setLogs.push({ reps, weight });
    }
    return {
      name: block.name,
      sets: block.plannedSets,
      setLogs
    };
  });

  return {
    title: state.activeSession.title,
    exercises,
    templateKey: state.activeSession.templateKey,
    sessionId: state.activeSession.sessionId
  };
}

function validateActiveEntry(entry) {
  for (const block of entry.exercises) {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      for (const ex of block.exercises) {
        if (!Array.isArray(ex.setLogs)) continue;
        for (let i = 0; i < ex.setLogs.length; i++) {
          if (!ex.setLogs[i].reps) {
            alert(`Enter reps for "${ex.name || 'exercise'}", set ${i + 1}.`);
            return false;
          }
        }
      }
    } else if (block.setLogs) {
      for (let i = 0; i < block.setLogs.length; i++) {
        if (!block.setLogs[i].reps) {
          alert(`Enter reps for "${block.name || 'exercise'}", set ${i + 1}.`);
          return false;
        }
      }
    }
  }
  return true;
}

function finishActiveWorkout() {
  if (!requireAuth()) return;
  if (!state.activeSession || !state.activeSession.dayKey) {
    return;
  }

  const entry = readActiveSessionEntryFromDom();
  if (!entry || !validateActiveEntry(entry)) {
    return;
  }

  const dayKey = state.activeSession.dayKey;
  const startedAt = state.activeSession.startedAt || Date.now();
  const durationMs = Date.now() - startedAt;

  const pbMessages = updatePersonalBestsWithEntry(entry);

  if (!state.calendarEntries[dayKey]) {
    state.calendarEntries[dayKey] = [];
  }
  state.calendarEntries[dayKey].push(entry);
  state.completedWorkoutDays[dayKey] = true;
  saveState();
  clearActiveSession();
  switchTab('calendar');
  if (state.selectedDay !== dayKey) {
    selectDay(dayKey);
  } else {
    renderDayWorkouts();
    renderCalendar();
    updateDashboard();
  }

  renderCompletedWorkoutsTab();
  renderPersonalBestsTab();

  launchConfetti();
  openWorkoutCompleteSummary(durationMs, pbMessages);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') return null;
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, mo, day] = parts;
  return new Date(y, mo - 1, day);
}

function collectCompletedWorkoutsGrouped() {
  const map = {};
  Object.keys(state.calendarEntries || {}).forEach((dateKey) => {
    const arr = state.calendarEntries[dateKey];
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const title = (entry.title && String(entry.title).trim()) || 'Untitled';
      if (!map[title]) map[title] = [];
      map[title].push({ dateKey, entry });
    });
  });
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((title) => ({
      title,
      items: map[title].sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    }));
}

function renderCompletedWorkoutsTab() {
  const root = document.getElementById('completed-workouts-root');
  if (!root) return;

  const groups = collectCompletedWorkoutsGrouped();
  root.innerHTML = '';

  if (groups.length === 0) {
    root.innerHTML =
      '<p class="muted">No completed workouts yet. Finish one from <strong>Active workout</strong> or add from the calendar.</p>';
    return;
  }

  groups.forEach(({ title, items }) => {
    const details = document.createElement('details');
    details.className = 'completed-category';

    const summary = document.createElement('summary');
    summary.className = 'completed-category-summary';
    summary.innerHTML = `${escapeHtml(title)}<span class="completed-category-count">${items.length}</span>`;

    const body = document.createElement('div');
    body.className = 'completed-category-body';

    items.forEach(({ dateKey, entry }) => {
      const local = parseDateKey(dateKey);
      const dateLabel = local
        ? local.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        : dateKey;
      const detailText = formatDayEntryDetails(entry);
      const item = document.createElement('div');
      item.className = 'completed-item';
      item.innerHTML = `<div class="completed-item-date">${escapeHtml(dateLabel)}</div><pre class="workout-details completed-item-details">${escapeHtml(detailText)}</pre>`;
      body.appendChild(item);
    });

    details.append(summary, body);
    root.appendChild(details);
  });
}

function renderCalendar() {
  calendarGrid.innerHTML = '';
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  monthLabel.textContent = state.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const cellKey = formatDate(cellDate);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day-cell';
    cell.innerHTML = `<span class="day-cell-num">${day}</span>`;

    if (state.completedWorkoutDays[cellKey]) {
      cell.classList.add('completed');
      cell.setAttribute('aria-label', `Workout completed — ${day}`);
    }

    if (state.selectedDay === cellKey) {
      cell.classList.add('active');
    }

    cell.addEventListener('click', () => selectDay(cellKey));
    calendarGrid.appendChild(cell);
  }
}

function selectDay(dateKey) {
  state.selectedDay = dateKey;
  const local = parseDateKey(dateKey);
  const readable = local
    ? local.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : dateKey;
  selectedDateText.textContent = readable;
  renderDayWorkouts();
  renderCalendar();
  updateDashboard();
}

function renderDayWorkouts() {
  const workouts = state.calendarEntries[state.selectedDay] || [];
  dayWorkouts.innerHTML = '';
  renderDayWorkoutOptions();
  if (!state.selectedDay) {
    return;
  }
  if (workouts.length === 0) {
    dayWorkouts.innerHTML = '<p class="muted">No workouts.</p>';
    return;
  }
  workouts.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'remove-exercise';
    deleteButton.textContent = 'Remove';
    deleteButton.addEventListener('click', () => {
      removeWorkoutFromDay(index);
    });
    const detailText = formatDayEntryDetails(item);
    card.innerHTML = `<h3>${escapeHtml(item.title)}</h3><pre class="workout-details">${escapeHtml(detailText)}</pre>`;
    card.appendChild(deleteButton);
    dayWorkouts.appendChild(card);
  });
}

function removeWorkoutFromDay(index) {
  if (!requireAuth()) return;
  if (!state.selectedDay) {
    return;
  }
  const workouts = state.calendarEntries[state.selectedDay] || [];
  if (index >= 0 && index < workouts.length) {
    const removedEntry = workouts[index];
    workouts.splice(index, 1);
    removeVideosForCalendarEntry(state.selectedDay, removedEntry);
    if (workouts.length === 0) {
      delete state.calendarEntries[state.selectedDay];
      delete state.completedWorkoutDays[state.selectedDay];
    }
    recomputePersonalBestsFromCalendar();
    saveState();
    renderDayWorkouts();
    renderCalendar();
    updateDashboard();
    renderCompletedWorkoutsTab();
    renderPersonalBestsTab();
    void renderVideosTab();
  }
}

function renderDayWorkoutOptions() {
  if (!dayWorkoutSelect) {
    return;
  }

  dayWorkoutSelect.innerHTML = '<option value="">Choose a workout</option>';

  if (state.workouts.length === 0) {
    dayWorkoutSelect.innerHTML = '<option value="">No workouts yet</option>';
    dayWorkoutSelect.disabled = true;
    return;
  }

  dayWorkoutSelect.disabled = false;
  state.workouts.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = item.title;
    dayWorkoutSelect.appendChild(option);
  });
}

function updateDashboard() {
  if (totalWorkoutsElem) {
    totalWorkoutsElem.textContent = String(state.workouts.length);
  }
  if (plannedDaysElem) {
    plannedDaysElem.textContent = String(Object.keys(state.calendarEntries).length);
  }
  if (nextWorkoutElem) {
    if (state.selectedDay && state.calendarEntries[state.selectedDay]?.length) {
      nextWorkoutElem.textContent = state.calendarEntries[state.selectedDay][0].title;
    } else {
      nextWorkoutElem.textContent = 'None';
    }
  }
}

function renderSavedWorkouts() {
  savedWorkoutsContainer.innerHTML = '';

  if (state.workouts.length === 0) {
    savedWorkoutsContainer.innerHTML = '<p class="muted">No workouts. Create one.</p>';
    renderDayWorkoutOptions();
    updateDashboard();
    return;
  }

  state.workouts.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const detailsText = formatWorkoutDetails(item);
    const detailsContent = detailsText
      ? `<pre class="workout-details">${escapeHtml(detailsText)}</pre>`
      : '<p class="muted">Empty</p>';
    card.innerHTML = `<h3>${escapeHtml(item.title)}</h3>${detailsContent}`;

    const assignButton = document.createElement('button');
    assignButton.type = 'button';
    assignButton.className = 'secondary-btn';
    assignButton.textContent = 'Start on selected day';
    assignButton.addEventListener('click', () => assignSavedWorkoutToDay(index));

    const changeButton = document.createElement('button');
    changeButton.type = 'button';
    changeButton.className = 'secondary-btn';
    changeButton.textContent = 'Change';
    changeButton.addEventListener('click', () => loadSavedWorkoutForEdit(index));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'remove-exercise';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteSavedWorkout(index));

    const actions = document.createElement('div');
    actions.className = 'saved-workout-card-actions';
    actions.append(assignButton, changeButton, deleteButton);
    card.appendChild(actions);
    savedWorkoutsContainer.appendChild(card);
  });

  renderDayWorkoutOptions();
  updateDashboard();
}

function deleteSavedWorkout(index) {
  if (!requireAuth()) return;
  const workout = state.workouts[index];
  if (!workout) return;

  const ok = confirm(`Delete "${workout.title}"? This cannot be undone.`);
  if (!ok) return;

  const workoutDetails = formatWorkoutDetails(workout);
  const templateKey = makeTemplateKey(workout);

  // Remove any day entries that were created from this saved workout.
  Object.keys(state.calendarEntries).forEach((dateKey) => {
    const entries = state.calendarEntries[dateKey];
    if (!Array.isArray(entries) || entries.length === 0) return;

    const filtered = entries.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      if (entry.title !== workout.title) return true;
      if (entry.templateKey === templateKey) return false;
      if (entry.details === workoutDetails) return false;
      return true;
    });

    if (filtered.length === 0) {
      delete state.calendarEntries[dateKey];
    } else {
      state.calendarEntries[dateKey] = filtered;
    }
  });

  state.workouts.splice(index, 1);
  if (builderEditIndex !== null) {
    if (builderEditIndex === index) {
      resetBuilder();
    } else if (builderEditIndex > index) {
      builderEditIndex -= 1;
    }
  }
  if (state.activeSession) {
    if (state.activeSession.savedWorkoutIndex === index) {
      state.activeSession = null;
    } else if (state.activeSession.savedWorkoutIndex > index) {
      state.activeSession.savedWorkoutIndex -= 1;
    }
  }
  recomputePersonalBestsFromCalendar();
  saveState();
  renderSavedWorkouts();
  renderActiveWorkoutPanel();
  renderDayWorkouts();
  renderCalendar();
  updateDashboard();
  renderCompletedWorkoutsTab();
  renderPersonalBestsTab();
}

function assignSavedWorkoutToDay(index) {
  beginWorkoutSession(index);
}

function assignWorkoutFromDropdown() {
  if (!requireAuth()) return;
  if (!state.selectedDay) {
    alert('Pick a day first.');
    return;
  }

  const selectedIndex = dayWorkoutSelect.value;
  if (!selectedIndex) {
    alert('Choose a workout.');
    return;
  }

  beginWorkoutSession(Number(selectedIndex));
  dayWorkoutSelect.value = '';
}

function readExerciseRow(row) {
  const name = row.querySelector('.exercise-name').value.trim();
  const sets = row.querySelector('.exercise-sets').value.trim();
  if (!name && !sets) return null;
  if (!name || !sets) {
    throw new Error('Each exercise needs a name and number of sets.');
  }
  return { name, sets };
}

function collectBuilderExercises() {
  const exercises = [];
  const children = Array.from(exerciseList.children);

  children.forEach((node) => {
    if (node.classList.contains('superset-block')) {
      const innerRows = node.querySelectorAll('.superset-exercises .exercise-row');
      const group = [];
      innerRows.forEach((row) => {
        const ex = readExerciseRow(row);
        if (ex) group.push(ex);
      });
      if (group.length === 0) {
        return;
      }
      if (group.length < 2) {
        throw new Error('Each superset needs at least two exercises.');
      }
      exercises.push({ type: 'superset', exercises: group });
    } else if (node.classList.contains('exercise-row')) {
      const ex = readExerciseRow(node);
      if (ex) exercises.push(ex);
    }
  });

  return exercises;
}

function resetBuilder() {
  builderEditIndex = null;
  workoutNameInput.value = '';
  exerciseList.innerHTML = '';
  addExerciseRow();
  syncWorkoutBuilderChrome();
}

function syncWorkoutBuilderChrome() {
  const titleEl = document.getElementById('workout-builder-title');
  const hint = document.getElementById('workout-builder-edit-hint');
  const cancelBtn = cancelEditWorkoutButton;
  if (builderEditIndex !== null) {
    if (titleEl) titleEl.textContent = 'Change workout';
    if (hint) {
      hint.classList.remove('hidden');
      hint.textContent =
        'Saving updates this template for the next time you start it. Past sessions, videos, and progress charts are not changed.';
    }
    cancelBtn?.classList.remove('hidden');
    if (saveWorkoutButton) saveWorkoutButton.textContent = 'Save changes';
  } else {
    if (titleEl) titleEl.textContent = 'New workout';
    if (hint) {
      hint.classList.add('hidden');
      hint.textContent = '';
    }
    cancelBtn?.classList.add('hidden');
    if (saveWorkoutButton) saveWorkoutButton.textContent = 'Save';
  }
}

function loadSavedWorkoutForEdit(index) {
  if (!requireAuth()) return;
  const w = state.workouts[index];
  if (!w || !Array.isArray(w.exercises) || w.exercises.length === 0) {
    alert('That workout cannot be edited.');
    return;
  }

  builderEditIndex = index;
  workoutNameInput.value = w.title;
  exerciseList.innerHTML = '';

  w.exercises.forEach((block) => {
    if (block.type === 'superset' && Array.isArray(block.exercises)) {
      exerciseList.appendChild(
        createSupersetBlock({
          exercises: block.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets
          }))
        })
      );
    } else {
      exerciseList.appendChild(
        createExerciseRow({
          name: block.name,
          sets: block.sets
        })
      );
    }
  });

  syncWorkoutBuilderChrome();
  switchTab('workouts');
}

function cancelWorkoutBuilderEdit() {
  resetBuilder();
}

function addExerciseRow(exercise = {}) {
  exerciseList.appendChild(createExerciseRow(exercise));
}

function addWorkoutTemplate() {
  if (!requireAuth()) return;
  const title = workoutNameInput.value.trim();
  if (!title) {
    alert('Enter a name.');
    return;
  }

  let exercises;
  try {
    exercises = collectBuilderExercises();
  } catch (error) {
    alert(error.message);
    return;
  }

  if (exercises.length === 0) {
    alert('Add at least one exercise.');
    return;
  }

  if (builderEditIndex !== null) {
    const idx = builderEditIndex;
    state.workouts[idx] = {
      title,
      exercises: JSON.parse(JSON.stringify(exercises))
    };
    builderEditIndex = null;
    saveState();
    renderSavedWorkouts();
    renderDayWorkoutOptions();
    renderPersonalBestsTab();
    resetBuilder();
    return;
  }

  state.workouts.push({ title, exercises });
  saveState();
  renderSavedWorkouts();
  renderPersonalBestsTab();
  resetBuilder();
}

function createAccount() {
  const username = authUsernameInput?.value.trim() || '';
  const password = authPasswordInput?.value || '';
  if (!username) {
    alert('Enter a username.');
    return;
  }

  if (password.length < 4) {
    alert('Password must be at least 4 characters.');
    return;
  }

  const users = getUsers();
  const existingUser = users.find((user) => user.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    if (existingUser.password === password) {
      loadUserData(existingUser.username);
      renderAllForActiveUser();
      alert('Welcome back. You are now logged in.');
      return;
    }
    alert('That username already exists. Use the correct password to log in.');
    return;
  }

  users.push({
    username,
    password,
    data: buildEmptyUserData()
  });
  setUsers(users);
  migrateLegacyProgressForUser(username);
  loadUserData(username);
  renderAllForActiveUser();
  alert('Account created. You are now logged in.');
}

function login() {
  const username = authUsernameInput?.value.trim() || '';
  const password = authPasswordInput?.value || '';

  const user = getUsers().find((entry) => entry.username.toLowerCase() === username.toLowerCase());

  if (!user || user.password !== password) {
    alert('Invalid username or password.');
    return;
  }

  migrateLegacyProgressForUser(user.username);
  loadUserData(user.username);
  renderAllForActiveUser();
}

function performLogoutCleanup() {
  revokeAllVideoPlaybackObjectUrls();
  state.activeUser = null;
  state.activeSession = null;
  state.workouts = [];
  state.calendarEntries = {};
  state.completedWorkoutDays = {};
  state.personalBests = {};
  state.videoLibrary = {};
  state.selectedDay = null;
  state.weeklyWorkoutGoal = null;
  if (authUsernameInput) authUsernameInput.value = '';
  if (authPasswordInput) authPasswordInput.value = '';
  localStorage.removeItem(ACTIVE_USER_KEY);
}

function logout() {
  performLogoutCleanup();
  syncAuthUi();
}

function renderAllForActiveUser() {
  renderCalendar();
  renderSavedWorkouts();
  renderActiveWorkoutPanel();
  resetBuilder();
  const startDay = state.selectedDay || formatDate(new Date());
  selectDay(startDay);
  updateDashboard();
  renderCompletedWorkoutsTab();
  renderPersonalBestsTab();
  void renderVideosTab();
}

prevMonthButton.addEventListener('click', () => {
  state.currentDate.setMonth(state.currentDate.getMonth() - 1);
  renderCalendar();
});

nextMonthButton.addEventListener('click', () => {
  state.currentDate.setMonth(state.currentDate.getMonth() + 1);
  renderCalendar();
});

assignDayWorkoutButton.addEventListener('click', assignWorkoutFromDropdown);
addExerciseButton.addEventListener('click', () => addExerciseRow());
addSupersetButton.addEventListener('click', () => exerciseList.appendChild(createSupersetBlock()));
saveWorkoutButton.addEventListener('click', addWorkoutTemplate);
cancelEditWorkoutButton?.addEventListener('click', cancelWorkoutBuilderEdit);
discardActiveWorkoutButton.addEventListener('click', () => {
  clearActiveSession();
});
finishActiveWorkoutButton.addEventListener('click', finishActiveWorkout);
closeWorkoutCompleteButton?.addEventListener('click', closeWorkoutCompleteSummary);
workoutCompleteModal?.addEventListener('click', (event) => {
  if (event.target === workoutCompleteModal) closeWorkoutCompleteSummary();
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});
createAccountButton?.addEventListener('click', createAccount);
loginButton?.addEventListener('click', login);
accountMenuButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAccountDropdown();
});
accountLogoutButton?.addEventListener('click', () => {
  logout();
});
switchCameraButton?.addEventListener('click', () => {
  switchCaptureCamera();
});
recordVideoButton?.addEventListener('click', () => {
  toggleVideoRecording();
});
closeVideoCaptureButton?.addEventListener('click', () => {
  closeVideoCaptureModal();
});
videoCaptureModal?.addEventListener('click', (event) => {
  if (event.target === videoCaptureModal) {
    closeVideoCaptureModal();
  }
});
document.addEventListener('click', (event) => {
  if (!accountMenu || !accountDropdown || accountDropdown.classList.contains('hidden')) {
    return;
  }
  if (!accountMenu.contains(event.target)) {
    accountDropdown.classList.add('hidden');
    accountMenuButton?.setAttribute('aria-expanded', 'false');
  }
});
authPasswordInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    void login();
  }
});
activeWorkoutRoot?.addEventListener('input', () => {
  if (!state.activeSession) return;
  syncActiveSessionSetLogsFromDom();
  scheduleSaveState();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    void saveState();
  }
});
window.addEventListener('pagehide', () => {
  void saveState();
});
window.addEventListener('beforeunload', () => {
  if (scheduledSaveTimeout) {
    clearTimeout(scheduledSaveTimeout);
    scheduledSaveTimeout = null;
  }
  void saveState();
});

function init() {
  syncAuthUi();
  const rememberedUser = localStorage.getItem(ACTIVE_USER_KEY);
  if (rememberedUser) {
    const exists = getUsers().some((user) => user.username.toLowerCase() === rememberedUser.toLowerCase());
    if (exists) {
      loadUserData(rememberedUser);
      renderAllForActiveUser();
      return;
    }
  }

  renderCalendar();
  renderSavedWorkouts();
  renderActiveWorkoutPanel();
  renderCompletedWorkoutsTab();
  renderPersonalBestsTab();
  void renderVideosTab();
}

init();
