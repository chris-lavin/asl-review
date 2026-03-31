const STORAGE_KEY = 'asl-review-progress-v1';
const RANGE_STORAGE_KEY = 'asl-review-range-v1';
const SHUFFLE_STORAGE_KEY = 'asl-review-shuffle-v1';

const state = {
  words: [],
  maxLesson: 45,
  deck: [],
  index: 0,
  revealed: false,
  progress: loadProgress(),
};

const els = {
  rangeStartInput: document.querySelector('#rangeStartInput'),
  rangeEndInput: document.querySelector('#rangeEndInput'),
  rangeStartValue: document.querySelector('#rangeStartValue'),
  rangeEndValue: document.querySelector('#rangeEndValue'),
  rangeSummary: document.querySelector('#rangeSummary'),
  sliderTrack: document.querySelector('#sliderTrack'),
  allLessonsBtn: document.querySelector('#allLessonsBtn'),
  searchInput: document.querySelector('#searchInput'),
  clearSearchBtn: document.querySelector('#clearSearchBtn'),
  hideKnownInput: document.querySelector('#hideKnownInput'),
  randomizeInput: document.querySelector('#randomizeInput'),
  heroLessonCount: document.querySelector('#heroLessonCount'),
  heroRangeLabel: document.querySelector('#heroRangeLabel'),
  deckLabel: document.querySelector('#deckLabel'),
  progressLabel: document.querySelector('#progressLabel'),
  deckCount: document.querySelector('#deckCount'),
  termText: document.querySelector('#termText'),
  lessonText: document.querySelector('#lessonText'),
  sourceLink: document.querySelector('#sourceLink'),
  answerArea: document.querySelector('#answerArea'),
  videoArea: document.querySelector('#videoArea'),
  videoStatus: document.querySelector('#videoStatus'),
  signGif: document.querySelector('#signGif'),
  signSequence: document.querySelector('#signSequence'),
  signVideo: document.querySelector('#signVideo'),
  wordList: document.querySelector('#wordList'),
  flashcard: document.querySelector('#flashcard'),
  prevBtn: document.querySelector('#prevBtn'),
  nextBtn: document.querySelector('#nextBtn'),
  knownBtn: document.querySelector('#knownBtn'),
  unknownBtn: document.querySelector('#unknownBtn'),
  shuffleAllBtn: document.querySelector('#shuffleAllBtn'),
};

init();

async function init() {
  try {
    const response = await fetch('./public/words.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load words (${response.status})`);
    state.words = await response.json();
    state.maxLesson = Math.max(...state.words.flatMap((word) => word.lessons), 45);
    setupRangeSliders();
    wireEvents();
    syncSearchClearButton();
    buildDeck();
  } catch (error) {
    console.error(error);
    els.deckLabel.textContent = 'Could not load words';
    els.termText.textContent = 'Try refreshing the page.';
    els.lessonText.textContent = error.message;
    els.answerArea.classList.remove('hidden');
    setNavDisabled(true);
  }
}

function setupRangeSliders() {
  els.rangeStartInput.min = '1';
  els.rangeStartInput.max = String(state.maxLesson);
  els.rangeEndInput.min = '1';
  els.rangeEndInput.max = String(state.maxLesson);

  const savedRange = loadRange();
  const defaultEnd = Math.min(18, state.maxLesson);
  const start = clamp(savedRange.start ?? 1, 1, state.maxLesson);
  const end = clamp(savedRange.end ?? defaultEnd, start, state.maxLesson);

  els.rangeStartInput.value = String(start);
  els.rangeEndInput.value = String(end);
  els.heroLessonCount.textContent = String(state.maxLesson);
  updateSliderUI();
}

function wireEvents() {
  ['input', 'change'].forEach((eventName) => {
    els.rangeStartInput.addEventListener(eventName, onRangeInput);
    els.rangeEndInput.addEventListener(eventName, onRangeInput);
  });

  els.searchInput.addEventListener('input', () => {
    syncSearchClearButton();
    buildDeck();
  });
  els.clearSearchBtn.addEventListener('click', clearSearch);
  els.hideKnownInput.addEventListener('change', buildDeck);
  els.randomizeInput.addEventListener('change', () => {
    if (!els.randomizeInput.checked) {
      clearShuffleState();
    }
    buildDeck();
  });

  els.allLessonsBtn.addEventListener('click', () => {
    els.rangeStartInput.value = '1';
    els.rangeEndInput.value = String(state.maxLesson);
    updateSliderUI();
    saveRange();
    buildDeck();
  });

  els.flashcard.addEventListener('click', toggleReveal);
  els.prevBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    moveCard(-1);
  });
  els.nextBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    moveCard(1);
  });
  els.knownBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    markKnown(true);
  });
  els.unknownBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    markKnown(false);
  });
  els.shuffleAllBtn.addEventListener('click', () => {
    els.randomizeInput.checked = true;
    resetShuffleState();
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

function onRangeInput(event) {
  let start = Number(els.rangeStartInput.value);
  let end = Number(els.rangeEndInput.value);

  if (start > end) {
    if (event.target === els.rangeStartInput) {
      end = start;
      els.rangeEndInput.value = String(end);
    } else {
      start = end;
      els.rangeStartInput.value = String(start);
    }
  }

  updateSliderUI();
  saveRange();
  buildDeck();
}

function updateSliderUI() {
  const min = Number(els.rangeStartInput.min);
  const max = Number(els.rangeStartInput.max);
  const start = Number(els.rangeStartInput.value);
  const end = Number(els.rangeEndInput.value);
  const startPct = ((start - min) / (max - min)) * 100;
  const endPct = ((end - min) / (max - min)) * 100;

  els.rangeStartValue.textContent = String(start);
  els.rangeEndValue.textContent = String(end);
  els.sliderTrack.style.left = `${startPct}%`;
  els.sliderTrack.style.width = `${Math.max(endPct - startPct, 0)}%`;
}

function syncSearchClearButton() {
  els.clearSearchBtn.classList.toggle('hidden', !els.searchInput.value);
}

function clearSearch() {
  if (!els.searchInput.value) return;
  els.searchInput.value = '';
  syncSearchClearButton();
  buildDeck();
  els.searchInput.focus();
}

function buildDeck() {
  const startLesson = Number(els.rangeStartInput.value || 1);
  const endLesson = Number(els.rangeEndInput.value || state.maxLesson);
  const query = els.searchInput.value.trim().toLowerCase();
  const hideKnown = els.hideKnownInput.checked;

  let deck = state.words.filter((item) => item.lessons.some((lesson) => lesson >= startLesson && lesson <= endLesson));

  if (query) {
    deck = deck.filter((item) => item.term.toLowerCase().includes(query));
  }

  if (hideKnown) {
    deck = deck.filter((item) => !state.progress[item.id]?.known);
  }

  if (els.randomizeInput.checked) {
    const shuffleKey = buildShuffleKey(deck, { startLesson, endLesson, query, hideKnown });
    deck = shufflePersisted(deck, shuffleKey);
  } else {
    deck = [...deck].sort((a, b) => a.lessons[0] - b.lessons[0] || a.term.localeCompare(b.term));
  }

  state.deck = deck;
  state.index = 0;
  state.revealed = false;
  updateRangeLabels(startLesson, endLesson);
  render();
}

function updateRangeLabels(startLesson, endLesson) {
  const lessonCount = endLesson - startLesson + 1;
  const rangeText = startLesson === endLesson ? `Lesson ${startLesson}` : `Lessons ${startLesson}–${endLesson}`;
  els.rangeSummary.textContent = rangeText;
  els.heroRangeLabel.textContent = `${startLesson}–${endLesson}`;
  els.heroLessonCount.textContent = String(lessonCount);
}

function render() {
  const totalKnown = Object.values(state.progress).filter((entry) => entry.known).length;
  els.progressLabel.textContent = `${totalKnown} marked known`;
  els.deckCount.textContent = `${state.deck.length} cards`;

  if (!state.deck.length) {
    els.deckLabel.textContent = 'No cards match this filter';
    els.termText.textContent = 'Try a different lesson range or search.';
    els.lessonText.textContent = 'No matching words right now.';
    els.answerArea.classList.remove('hidden');
    els.sourceLink.href = '#';
    els.wordList.innerHTML = '';
    resetVideo();
    setNavDisabled(true);
    return;
  }

  const item = state.deck[state.index];
  els.deckLabel.textContent = `Card ${state.index + 1} of ${state.deck.length}`;
  els.termText.textContent = item.term;
  els.lessonText.textContent = formatLessonList(item.lessons);
  els.sourceLink.href = item.sourceUrl;
  els.answerArea.classList.toggle('hidden', !state.revealed);
  if (state.revealed) {
    applyMedia(item.media);
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
      const activeClass = idx === state.index ? 'active-row' : '';
      return `
        <li class="word-row ${activeClass}" data-index="${idx}" role="button" tabindex="0" aria-label="Open ${escapeHtml(item.term)}">
          <div class="word-main">
            <div class="word-term">${escapeHtml(item.term)}</div>
            <div class="word-meta">
              <span class="badge ${known ? 'known' : ''}">${known ? 'Known' : 'Reviewing'}</span>
              <span class="badge">${formatLessonBadge(item.lessons)}</span>
            </div>
          </div>
        </li>`;
    })
    .join('');

  els.wordList.querySelectorAll('.word-row').forEach((row) => {
    const openRow = () => {
      state.index = Number(row.dataset.index);
      state.revealed = false;
      render();
      row.scrollIntoView({ block: 'nearest' });
    };
    row.addEventListener('click', openRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRow();
      }
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
  els.videoStatus.textContent = 'Loading sign media…';
  els.signGif.classList.add('hidden');
  els.signGif.removeAttribute('src');
  els.signSequence.classList.add('hidden');
  els.signSequence.innerHTML = '';
  els.signVideo.classList.add('hidden');
  els.signVideo.removeAttribute('src');
}

function applyMedia(media) {
  resetVideo();
  els.videoArea.classList.remove('hidden');

  if (!media?.url && !media?.urls?.length) {
    els.videoStatus.textContent = 'No sign media found for this page. Use the Lifeprint link below.';
    return;
  }

  if (media.type === 'gif') {
    els.videoStatus.textContent = 'Animated sign reference';
    els.signGif.src = media.url;
    els.signGif.classList.remove('hidden');
    return;
  }

  if (media.type === 'image-sequence') {
    els.videoStatus.textContent = 'Step-by-step sign image sequence';
    els.signSequence.innerHTML = media.urls
      .map((url, index) => `<img src="${escapeHtml(url)}" alt="Sign step ${index + 1}" loading="lazy" />`)
      .join('');
    els.signSequence.classList.remove('hidden');
    return;
  }

  els.videoStatus.textContent = media.quality === 'fallback' ? 'Context example video' : 'Sign demo video';
  els.signVideo.src = media.url.includes('youtube.com/embed/') ? buildAutoplayLoopUrl(media.url) : media.url;
  els.signVideo.classList.remove('hidden');
}

function buildAutoplayLoopUrl(videoUrl) {
  const url = new URL(videoUrl);
  const videoId = url.pathname.split('/').filter(Boolean).pop();
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('mute', '1');
  url.searchParams.set('loop', '1');
  url.searchParams.set('playlist', videoId);
  url.searchParams.set('playsinline', '1');
  return url.toString();
}

function saveRange() {
  const start = Number(els.rangeStartInput.value || 1);
  const end = Number(els.rangeEndInput.value || state.maxLesson);
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify({ start, end }));
}

function loadRange() {
  try {
    return JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function buildShuffleKey(deck, filters) {
  return JSON.stringify({
    ids: deck.map((item) => item.id),
    filters,
  });
}

function loadShuffleState() {
  try {
    return JSON.parse(localStorage.getItem(SHUFFLE_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveShuffleState(state) {
  localStorage.setItem(SHUFFLE_STORAGE_KEY, JSON.stringify(state));
}

function clearShuffleState() {
  localStorage.removeItem(SHUFFLE_STORAGE_KEY);
}

function resetShuffleState() {
  const state = loadShuffleState();
  delete state.key;
  delete state.order;
  saveShuffleState(state);
}

function shufflePersisted(deck, key) {
  const saved = loadShuffleState();
  const ids = deck.map((item) => item.id);
  if (saved.key === key && Array.isArray(saved.order)) {
    const orderMap = new Map(saved.order.map((id, index) => [id, index]));
    if (ids.every((id) => orderMap.has(id))) {
      return [...deck].sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
    }
  }

  const shuffled = shuffle(deck);
  saveShuffleState({ key, order: shuffled.map((item) => item.id) });
  return shuffled;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatLessonList(lessons) {
  if (!lessons?.length) return '';
  if (lessons.length === 1) return `Lesson ${lessons[0]}`;
  return `Lessons ${lessons.join(', ')}`;
}

function formatLessonBadge(lessons) {
  if (!lessons?.length) return '';
  if (lessons.length === 1) return `Lesson ${lessons[0]}`;
  return `${lessons.length} lessons`;
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
