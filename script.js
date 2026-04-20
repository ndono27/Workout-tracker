const USER_STORE_KEY = 'workoutUsers';
const ACTIVE_USER_KEY = 'workoutActiveUser';

function buildEmptyUserData() {
  return {
    workouts: [],
    calendarEntries: {},
    completedWorkoutDays: {},
    personalBests: {}
  };
}

function normalizeUserRecord(rawUser) {
  const data = rawUser && typeof rawUser === 'object' ? rawUser.data || {} : {};
  return {
    username: String(rawUser?.username || ''),
    password: String(rawUser?.password || ''),
    data: {
      workouts: Array.isArray(data.workouts) ? data.workouts : [],
      calendarEntries: data.calendarEntries && typeof data.calendarEntries === 'object' ? data.calendarEntries : {},
      completedWorkoutDays:
        data.completedWorkoutDays && typeof data.completedWorkoutDays === 'object' ? data.completedWorkoutDays : {},
      personalBests: data.personalBests && typeof data.personalBests === 'object' ? data.personalBests : {}
    }
  };
}

function getUsers() {
  const raw = JSON.parse(localStorage.getItem(USER_STORE_KEY) || '[]');
  return Array.isArray(raw) ? raw.map(normalizeUserRecord) : [];
}

function setUsers(users) {
  localStorage.setItem(USER_STORE_KEY, JSON.stringify(users.map(normalizeUserRecord)));
}

const state = {
  currentDate: new Date(),
  selectedDay: null,
  workouts: [],
  calendarEntries: {},
  completedWorkoutDays: {},
  personalBests: {},
  activeSession: null,
  activeUser: null
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
const accountResetPbsButton = document.getElementById('account-reset-pbs-button');
const accountLogoutButton = document.getElementById('account-logout-button');

function saveState() {
  if (!state.activeUser) {
    return;
  }

  const users = getUsers();
  const userIndex = users.findIndex((user) => user.username.toLowerCase() === state.activeUser.toLowerCase());
  if (userIndex === -1) {
    return;
  }

  users[userIndex].data = {
    workouts: state.workouts,
    calendarEntries: state.calendarEntries,
    completedWorkoutDays: state.completedWorkoutDays,
    personalBests: state.personalBests
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
    authStatusText.textContent = isLoggedIn
      ? `Logged in as ${state.activeUser}. Your workouts and progress are saved to this account.`
      : 'Create an account or log in to save your workouts and progress.';
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
  const data = user ? user.data : buildEmptyUserData();
  state.workouts = Array.isArray(data.workouts) ? data.workouts : [];
  state.calendarEntries = data.calendarEntries && typeof data.calendarEntries === 'object' ? data.calendarEntries : {};
  state.completedWorkoutDays =
    data.completedWorkoutDays && typeof data.completedWorkoutDays === 'object' ? data.completedWorkoutDays : {};
  state.personalBests = data.personalBests && typeof data.personalBests === 'object' ? data.personalBests : {};
  state.activeSession = null;
  state.selectedDay = null;
  state.activeUser = username;
  localStorage.setItem(ACTIVE_USER_KEY, username);
  syncAuthUi();
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
  saveState();
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
  if (target === 'personal-bests') {
    renderPersonalBestsTab();
  }
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

function renderPersonalBestsTab() {
  const root = document.getElementById('personal-bests-root');
  if (!root) return;

  root.innerHTML = '';
  const pbGroups = state.personalBests && typeof state.personalBests === 'object' ? state.personalBests : {};
  const workoutMap = {};

  state.workouts.forEach((workout) => {
    const title = String(workout?.title || 'Untitled').trim() || 'Untitled';
    const key = normalizeWorkoutKey(title) || 'untitled';
    if (!workoutMap[key]) {
      workoutMap[key] = { title, exerciseNames: [] };
    }
    workoutMap[key].exerciseNames = collectWorkoutExerciseNames(workout);
  });

  Object.keys(pbGroups).forEach((key) => {
    if (!workoutMap[key]) {
      const g = pbGroups[key];
      workoutMap[key] = { title: g?.title || 'Untitled', exerciseNames: [] };
    }
  });

  const keys = Object.keys(workoutMap).sort((a, b) => workoutMap[a].title.localeCompare(workoutMap[b].title));
  if (keys.length === 0) {
    root.innerHTML = '<p class="muted">No workouts yet.</p>';
    return;
  }

  keys.forEach((workoutKey) => {
    const group = workoutMap[workoutKey];
    const pbGroup = pbGroups[workoutKey]?.exercises || {};
    const exerciseKeys = Object.keys(pbGroup);
    const allExerciseNames = Array.from(new Set([...(group.exerciseNames || []), ...exerciseKeys.map((k) => pbGroup[k]?.displayName || k)]));

    const card = document.createElement('div');
    card.className = 'completed-category';

    const header = document.createElement('div');
    header.className = 'completed-category-summary pb-workout-summary';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'pb-workout-title';
    titleWrap.innerHTML = `<span>${escapeHtml(group.title)}</span>`;

    header.append(titleWrap);

    const body = document.createElement('div');
    body.className = 'completed-category-body';

    if (allExerciseNames.length === 0) {
      body.innerHTML = '<p class="muted">No exercises in this workout.</p>';
    } else {
      allExerciseNames
        .sort((a, b) => a.localeCompare(b))
        .forEach((name) => {
          const exKey = normalizeExerciseKey(name);
          const pb = pbGroup[exKey] || { maxReps: 0, maxWeight: 0, topWeightSetReps: 0 };
          const row = document.createElement('div');
          row.className = 'pb-exercise-row';
          const canReset = Boolean(pbGroup[exKey]);
          row.innerHTML = `<span class="pb-exercise-name">${escapeHtml(name)}</span><span class="pb-exercise-metrics">Best reps: ${pb.maxReps || 0} | Best weight: ${pb.maxWeight || 0}<br>Set with most weight: ${pb.maxWeight || 0} for ${pb.topWeightSetReps || 0} reps</span>`;

          const resetButton = document.createElement('button');
          resetButton.type = 'button';
          resetButton.className = 'danger-btn';
          resetButton.textContent = 'Reset';
          resetButton.disabled = !canReset;
          if (canReset) {
            resetButton.addEventListener('click', () => resetPersonalBestForExercise(workoutKey, exKey));
          }

          row.appendChild(resetButton);
          body.appendChild(row);
        });
    }

    card.append(header, body);
    root.appendChild(card);
  });
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
    blocks: buildSessionBlocks(saved),
    startedAt: Date.now()
  };

  renderActiveWorkoutPanel();
  switchTab('active-workout');
}

function clearActiveSession() {
  state.activeSession = null;
  renderActiveWorkoutPanel();
}

function appendActiveSetRow(container, bi, ej, setIndex, exerciseName) {
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

  const weight = document.createElement('input');
  weight.type = 'text';
  weight.className = 'active-weight';
  weight.placeholder = 'Weight (optional)';
  weight.setAttribute('aria-label', `Weight ${exerciseName} set ${setIndex + 1}`);

  row.append(label, reps, weight);
  container.appendChild(row);
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
        const h = document.createElement('h4');
        h.textContent = ex.name || `Exercise ${ej + 1}`;
        card.appendChild(h);
        for (let si = 0; si < ex.plannedSets; si++) {
          appendActiveSetRow(card, bi, ej, si, ex.name || '');
        }
        wrap.appendChild(card);
      });

      activeWorkoutRoot.appendChild(wrap);
    } else {
      const card = document.createElement('div');
      card.className = 'active-exercise-card';
      const h = document.createElement('h4');
      h.textContent = block.name || 'Exercise';
      card.appendChild(h);
      for (let si = 0; si < block.plannedSets; si++) {
        appendActiveSetRow(card, bi, -1, si, block.name || '');
      }
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
    templateKey: state.activeSession.templateKey
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

  launchConfetti();
  openWorkoutCompleteSummary(durationMs, pbMessages);
  renderCompletedWorkoutsTab();
  renderPersonalBestsTab();
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
    workouts.splice(index, 1);
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

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'remove-exercise';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteSavedWorkout(index));

    card.appendChild(assignButton);
    card.appendChild(deleteButton);
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
  workoutNameInput.value = '';
  exerciseList.innerHTML = '';
  addExerciseRow();
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
  const exists = users.some((user) => user.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    alert('That username is already taken.');
    return;
  }

  users.push({
    username,
    password,
    data: buildEmptyUserData()
  });
  setUsers(users);
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

  loadUserData(user.username);
  renderAllForActiveUser();
}

function logout() {
  state.activeUser = null;
  state.activeSession = null;
  state.workouts = [];
  state.calendarEntries = {};
  state.completedWorkoutDays = {};
  state.personalBests = {};
  state.selectedDay = null;
  if (authUsernameInput) authUsernameInput.value = '';
  if (authPasswordInput) authPasswordInput.value = '';
  localStorage.removeItem(ACTIVE_USER_KEY);
  syncAuthUi();
}

function resetPersonalBests() {
  if (!requireAuth()) return;
  const ok = confirm('Reset all personal bests for this account?');
  if (!ok) return;
  state.personalBests = {};
  saveState();
  renderPersonalBestsTab();
  accountDropdown?.classList.add('hidden');
  accountMenuButton?.setAttribute('aria-expanded', 'false');
  alert('Personal bests reset.');
}

function renderAllForActiveUser() {
  renderCalendar();
  renderSavedWorkouts();
  renderActiveWorkoutPanel();
  resetBuilder();
  const todayKey = formatDate(new Date());
  selectDay(todayKey);
  updateDashboard();
  renderCompletedWorkoutsTab();
  renderPersonalBestsTab();
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
accountResetPbsButton?.addEventListener('click', () => {
  resetPersonalBests();
});
accountLogoutButton?.addEventListener('click', () => {
  logout();
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
    login();
  }
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
}

init();
