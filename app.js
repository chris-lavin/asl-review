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
  rangeStartInput: document.querySelector('#rangeStartInput'),
  rangeEndInput: document.querySelector('#rangeEndInput'),
  rangeStartValue: document.querySelector('#rangeStartValue'),
  rangeEndValue: document.querySelector('#rangeEndValue'),
  rangeSummary: document.querySelector('#rangeSummary'),
  sliderTrack: document.querySelector('#sliderTrack'),
  allLessonsBtn: document.querySelector('#allLessonsBtn'),
  searchInput: document.querySelector('#searchInput'),
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
    setupRangeSliders();
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

function setupRangeSliders() {
  const maxLesson = state.lessons[state.lessons.length - 1].lesson;
  els.rangeStartInput.min = '1';
  els.rangeStartInput.max = String(maxLesson);
  els.rangeEndInput.min = '1';
  els.rangeEndInput.max = String(maxLesson);
  els.rangeStartInput.value = '1';
  els.rangeEndInput.value = '18';
  els.heroLessonCount.textContent = String(state.lessons.length);
  updateSliderUI();
}

function wireEvents() {
  ['input', 'change'].forEach((eventName) => {
    els.rangeStartInput.addEventListener(eventName, onRangeInput);
    els.rangeEndInput.addEventListener(eventName, onRangeInput);
  });

  els.searchInput.addEventListener('input', buildDeck);
  els.hideKnownInput.addEventListener('change', buildDeck);
  els.randomizeInput.addEventListener('change', buildDeck);

  els.allLessonsBtn.addEventListener('click', () => {
    const maxLesson = state.lessons[state.lessons.length - 1].lesson;
    els.rangeStartInput.value = '1';
    els.rangeEndInput.value = String(maxLesson);
    updateSliderUI();
    buildDeck();
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

function buildDeck() {
  const startLesson = Number(els.rangeStartInput.value || 1);
  const endLesson = Number(els.rangeEndInput.value || state.lessons.length);
  const query = els.searchInput.value.trim().toLowerCase();
  const hideKnown = els.hideKnownInput.checked;

  let lessons = state.lessons.filter((lesson) => lesson.lesson >= startLesson && lesson.lesson <= endLesson);

  const grouped = new Map();
  for (const lesson of lessons) {
    for (const item of lesson.items) {
      const key = item.term.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, {
          term: item.term,
          url: item.url,
          lessons: [lesson.lesson],
        });
      } else {
        const existing = grouped.get(key);
        if (!existing.lessons.includes(lesson.lesson)) existing.lessons.push(lesson.lesson);
      }
    }
  }

  let deck = Array.from(grouped.values()).map((item) => ({
    ...item,
    lessons: item.lessons.sort((a, b) => a - b),
    id: item.term.toLowerCase(),
  }));

  if (query) {
    deck = deck.filter((item) => item.term.toLowerCase().includes(query));
  }

  if (hideKnown) {
    deck = deck.filter((item) => !state.progress[item.id]?.known);
  }

  if (els.randomizeInput.checked) {
    deck = shuffle(deck);
  } else {
    deck.sort((a, b) => a.lessons[0] - b.lessons[0] || a.term.localeCompare(b.term));
  }

  state.deck = deck;
  state.index = 0;
  state.revealed = false;
  updateRangeLabels(startLesson, endLesson, lessons.length);
  render();
}

function updateRangeLabels(startLesson, endLesson, lessonCount) {
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
    const result = payload.media || null;
    state.videoCache[item.url] = result;
    applyVideoResult(result);
  } catch {
    state.videoCache[item.url] = null;
    applyVideoResult(null);
  }
}

function applyVideoResult(media) {
  if (!media?.url) {
    els.videoStatus.textContent = 'No sign media found for this page. Use the Lifeprint link below.';
    els.signGif.classList.add('hidden');
    els.signGif.removeAttribute('src');
    els.signVideo.classList.add('hidden');
    els.signVideo.removeAttribute('src');
    return;
  }

  if (media.type === 'gif') {
    els.videoStatus.textContent = 'Animated sign reference';
    els.signVideo.classList.add('hidden');
    els.signVideo.removeAttribute('src');
    els.signGif.src = media.url;
    els.signGif.classList.remove('hidden');
    return;
  }

  const autoplayUrl = buildAutoplayLoopUrl(media.url);
  els.videoStatus.textContent = 'Embedded sign video';
  els.signGif.classList.add('hidden');
  els.signGif.removeAttribute('src');
  els.signVideo.src = autoplayUrl;
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
