const STORAGE_KEY = 'asl-review-progress-v1';

const state = {
  lessons: [],
  deck: [],
  index: 0,
  revealed: false,
  progress: loadProgress(),
  videoCache: {},
};

const els = {
  lessonSelect: document.querySelector('#lessonSelect'),
  searchInput: document.querySelector('#searchInput'),
  hideKnownInput: document.querySelector('#hideKnownInput'),
  randomizeInput: document.querySelector('#randomizeInput'),
  deckLabel: document.querySelector('#deckLabel'),
  progressLabel: document.querySelector('#progressLabel'),
  deckCount: document.querySelector('#deckCount'),
  termText: document.querySelector('#termText'),
  lessonText: document.querySelector('#lessonText'),
  sourceLink: document.querySelector('#sourceLink'),
  answerArea: document.querySelector('#answerArea'),
  videoArea: document.querySelector('#videoArea'),
  videoStatus: document.querySelector('#videoStatus'),
  signVideo: document.querySelector('#signVideo'),
  wordList: document.querySelector('#wordList'),
  flashcard: document.querySelector('#flashcard'),
  prevBtn: document.querySelector('#prevBtn'),
  nextBtn: document.querySelector('#nextBtn'),
  flipBtn: document.querySelector('#flipBtn'),
  knownBtn: document.querySelector('#knownBtn'),
  unknownBtn: document.querySelector('#unknownBtn'),
  shuffleAllBtn: document.querySelector('#shuffleAllBtn'),
};

init();

async function init() {
  try {
    const response = await fetch('./public/lessons.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load lessons (${response.status})`);
    state.lessons = await response.json();
    populateLessonSelect();
    wireEvents();
    buildDeck();
  } catch (error) {
    console.error(error);
    els.deckLabel.textContent = 'Could not load lessons';
    els.termText.textContent = 'Try refreshing the page.';
    els.lessonText.textContent = error.message;
    els.answerArea.classList.remove('hidden');
    setNavDisabled(true);
  }
}

function populateLessonSelect() {
  const options = ['<option value="all">All lessons (1–18)</option>'];
  for (const lesson of state.lessons) {
    options.push(`<option value="${lesson.lesson}">Lesson ${lesson.lesson} (${lesson.count} words)</option>`);
  }
  els.lessonSelect.innerHTML = options.join('');
}

function wireEvents() {
  ['change', 'input'].forEach((eventName) => {
    els.lessonSelect.addEventListener(eventName, buildDeck);
    els.searchInput.addEventListener(eventName, buildDeck);
    els.hideKnownInput.addEventListener(eventName, buildDeck);
    els.randomizeInput.addEventListener(eventName, buildDeck);
  });

  els.flashcard.addEventListener('click', toggleReveal);
  els.flipBtn.addEventListener('click', toggleReveal);
  els.prevBtn.addEventListener('click', () => moveCard(-1));
  els.nextBtn.addEventListener('click', () => moveCard(1));
  els.knownBtn.addEventListener('click', () => markKnown(true));
  els.unknownBtn.addEventListener('click', () => markKnown(false));
  els.shuffleAllBtn.addEventListener('click', () => {
    els.randomizeInput.checked = true;
    buildDeck();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') moveCard(-1);
    if (event.key === 'ArrowRight') moveCard(1);
    if (event.key === ' ') {
      event.preventDefault();
      toggleReveal();
    }
    if (event.key.toLowerCase() === 'k') markKnown(true);
    if (event.key.toLowerCase() === 'u') markKnown(false);
  });
}

function buildDeck() {
  const selectedLesson = els.lessonSelect.value || 'all';
  const query = els.searchInput.value.trim().toLowerCase();
  const hideKnown = els.hideKnownInput.checked;

  let lessons = state.lessons;
  if (selectedLesson !== 'all') {
    lessons = lessons.filter((lesson) => String(lesson.lesson) === selectedLesson);
  }

  let deck = lessons.flatMap((lesson) =>
    lesson.items.map((item) => ({ ...item, lesson: lesson.lesson, id: `${lesson.lesson}:${item.term}` }))
  );

  if (query) {
    deck = deck.filter((item) => item.term.toLowerCase().includes(query));
  }

  if (hideKnown) {
    deck = deck.filter((item) => !state.progress[item.id]?.known);
  }

  if (els.randomizeInput.checked) {
    deck = shuffle(deck);
  } else {
    deck.sort((a, b) => a.lesson - b.lesson || a.term.localeCompare(b.term));
  }

  state.deck = deck;
  state.index = 0;
  state.revealed = false;
  render();
}

function render() {
  const totalKnown = Object.values(state.progress).filter((entry) => entry.known).length;
  els.progressLabel.textContent = `${totalKnown} marked known`;
  els.deckCount.textContent = `${state.deck.length} cards`;

  if (!state.deck.length) {
    els.deckLabel.textContent = 'No cards match this filter';
    els.termText.textContent = 'Try a different lesson or search.';
    els.lessonText.textContent = 'No matching words right now.';
    els.answerArea.classList.remove('hidden');
    els.sourceLink.href = '#';
    els.wordList.innerHTML = '';
    setNavDisabled(true);
    return;
  }

  const item = state.deck[state.index];
  els.deckLabel.textContent = `Card ${state.index + 1} of ${state.deck.length}`;
  els.termText.textContent = item.term;
  els.lessonText.textContent = `Lesson ${item.lesson}`;
  els.sourceLink.href = item.url;
  els.answerArea.classList.toggle('hidden', !state.revealed);
  if (state.revealed) {
    loadVideoForItem(item);
  } else {
    resetVideo();
  }
  setNavDisabled(false);
  renderList();
}

function renderList() {
  els.wordList.innerHTML = state.deck
    .map((item, idx) => {
      const known = state.progress[item.id]?.known;
      const activeStyle = idx === state.index ? ' style="background:rgba(124,156,255,0.08); border-radius:18px;"' : '';
      return `
        <li${activeStyle}>
          <div class="word-main">
            <div class="word-term">${escapeHtml(item.term)}</div>
            <div class="word-meta">
              <span class="badge ${known ? 'known' : ''}">${known ? 'Known' : 'Reviewing'}</span>
              <span class="badge">Lesson ${item.lesson}</span>
            </div>
          </div>
          <button class="open-btn" data-index="${idx}">Open</button>
        </li>`;
    })
    .join('');

  els.wordList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.index = Number(button.dataset.index);
      state.revealed = false;
      render();
    });
  });
}

function toggleReveal() {
  if (!state.deck.length) return;
  state.revealed = !state.revealed;
  render();
}

function moveCard(direction) {
  if (!state.deck.length) return;
  state.index = (state.index + direction + state.deck.length) % state.deck.length;
  state.revealed = false;
  render();
}

function markKnown(known) {
  const item = state.deck[state.index];
  if (!item) return;
  state.progress[item.id] = { known, updatedAt: new Date().toISOString() };
  saveProgress();
  if (known && els.hideKnownInput.checked) {
    buildDeck();
    return;
  }
  render();
}

function setNavDisabled(disabled) {
  [els.prevBtn, els.nextBtn, els.flipBtn, els.knownBtn, els.unknownBtn].forEach((button) => {
    button.disabled = disabled;
  });
}

function resetVideo() {
  els.videoArea.classList.add('hidden');
  els.videoStatus.textContent = 'Loading sign video…';
  els.signVideo.classList.add('hidden');
  els.signVideo.removeAttribute('src');
}

async function loadVideoForItem(item) {
  resetVideo();
  els.videoArea.classList.remove('hidden');

  if (state.videoCache[item.url] !== undefined) {
    applyVideoResult(state.videoCache[item.url]);
    return;
  }

  try {
    const apiUrl = `../api/asl-video?url=${encodeURIComponent(item.url)}`;
    const response = await fetch(apiUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load video (${response.status})`);
    const payload = await response.json();
    const result = payload.embedUrl || null;
    state.videoCache[item.url] = result;
    applyVideoResult(result);
  } catch {
    state.videoCache[item.url] = null;
    applyVideoResult(null);
  }
}

function applyVideoResult(videoUrl) {
  if (!videoUrl) {
    els.videoStatus.textContent = 'No embedded video found for this sign. Use the Lifeprint link below.';
    els.signVideo.classList.add('hidden');
    els.signVideo.removeAttribute('src');
    return;
  }

  els.videoStatus.textContent = 'Embedded sign video';
  els.signVideo.src = videoUrl;
  els.signVideo.classList.remove('hidden');
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function shuffle(items) {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
