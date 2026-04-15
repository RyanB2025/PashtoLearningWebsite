/**
 * ════════════════════════════════════════════════════════════════
 * Learn Pashto Today — script.js
 * SPA Engine: Router · JSON Fetcher · Content Renderer · Quiz · State
 * Architecture: Pure ES6+ Vanilla JS (no dependencies)
 * ════════════════════════════════════════════════════════════════
 */

'use strict';

/* ─── Configuration ────────────────────────────────────────────── */
const CONFIG = {
  DATA_BASE:      './data',
  INDEX_FILE:     'index.json',
  LESSONS_FOLDER: 'lessons',
  STORAGE_KEY:    'learnpashtotoday_completed_lessons',
};

/* ─── State ─────────────────────────────────────────────────────── */
const State = {
  lessons: [],
  currentLessonId: null,
  completedIds: new Set(),

  save() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify([...this.completedIds]));
    } catch (e) {
      console.warn('[Learn Pashto Today] localStorage unavailable:', e);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) this.completedIds = new Set(arr);
      }
    } catch (e) {
      console.warn('[Learn Pashto Today] Could not read localStorage:', e);
    }
  },

  markComplete(lessonId) {
    this.completedIds.add(lessonId);
    this.save();
  },

  isComplete(lessonId) {
    return this.completedIds.has(lessonId);
  }
};

/* ─── DOM Refs ──────────────────────────────────────────────────── */
const DOM = {
  navList:        () => document.getElementById('nav-list'),
  welcomeSplash:  () => document.getElementById('welcome-splash'),
  lessonWrapper:  () => document.getElementById('lesson-wrapper'),
  lessonCard:     () => document.getElementById('lesson-card'),
  lessonFooter:   () => document.getElementById('lesson-footer'),
  btnFinish:      () => document.getElementById('btn-finish'),
  loadingState:   () => document.getElementById('loading-state'),
  errorState:     () => document.getElementById('error-state'),
  errorMessage:   () => document.getElementById('error-message'),
  progressBar:    () => document.getElementById('global-progress-bar'),
  progressText:   () => document.getElementById('global-progress-text'),
};

/* ─── Utilities ─────────────────────────────────────────────────── */

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
  return res.json();
}

/** Sanitize URLs to prevent javascript: XSS payloads */
function sanitizeUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  const dangerousProtocols = /^(javascript|vbscript|data):/i;
  if (dangerousProtocols.test(url.trim())) {
    console.warn('[Security] Blocked dangerous URL protocol');
    return '#';
  }
  return url;
}

/** Safely decodes HTML entities (like &#39;) without XSS risk */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  const doc = new DOMParser().parseFromString(str, 'text/html');
  return doc.documentElement.textContent || '';
}

/** Strictly escape HTML characters for the rare innerHTML insertions */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') e.append(document.createTextNode(child));
    else e.append(child);
  }
  return e;
}

function optionLetter(i) {
  return String.fromCharCode(65 + i);
}

function show(node) { node.hidden = false; }
function hide(node) { node.hidden = true; }

/* ─── Progress Bar ──────────────────────────────────────────────── */
function updateProgressUI() {
  const total = State.lessons.length;
  const done  = [...State.completedIds].filter(id =>
    State.lessons.some(l => l.id === id)
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const bar  = DOM.progressBar();
  const text = DOM.progressText();
  if (bar)  bar.style.width  = `${pct}%`;
  if (text) text.textContent = `${done} / ${total}`;

  const wrap = bar?.parentElement;
  if (wrap) wrap.setAttribute('aria-valuenow', pct);
}

/* ─── Navigation ────────────────────────────────────────────────── */

function buildNav() {
  const list = DOM.navList();
  if (!list) return;
  list.innerHTML = '';

  State.lessons.forEach((lesson, idx) => {
    const isComplete = State.isComplete(lesson.id);
    const item = el('li', { className: 'nav-item' });

    const btn = el('button', {
      className: `nav-item-btn${isComplete ? ' completed' : ''}`,
      type: 'button',
      'aria-label': `${lesson.title}${isComplete ? ' (completed)' : ''}`,
      'data-lesson-id': lesson.id,
    });

    const numBadge = el('span', { className: 'nav-num', 'aria-hidden': 'true' },
      isComplete ? '✓' : String(idx + 1)
    );

    const labelWrap = el('span', { className: 'nav-label-text' });
    if (lesson.category) {
      labelWrap.append(el('span', { className: 'nav-label-category' }, lesson.category));
    }
    labelWrap.append(document.createTextNode(sanitize(lesson.title)));

    const checkWrap = el('span', { className: 'nav-check', 'aria-hidden': 'true' });
    checkWrap.innerHTML = `<svg viewBox="0 0 20 20"><path d="M16.7 5.3a1 1 0 00-1.4 0L8 12.6 4.7 9.3a1 1 0 00-1.4 1.4l4 4a1 1 0 001.4 0l8-8a1 1 0 000-1.4z"/></svg>`;

    btn.append(numBadge, labelWrap, checkWrap);
    btn.addEventListener('click', () => navigateTo(lesson.id));

    item.append(btn);
    list.append(item);
  });
}

function syncNavState() {
  const list = DOM.navList();
  if (!list) return;

  list.querySelectorAll('.nav-item-btn').forEach(btn => {
    const id = btn.dataset.lessonId;
    const isActive    = id === State.currentLessonId;
    const isComplete  = State.isComplete(id);

    btn.classList.toggle('active', isActive);
    btn.classList.toggle('completed', isComplete);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    
    const lessonTitle = State.lessons.find(l => l.id === id)?.title ?? id;
    btn.setAttribute('aria-label', `${lessonTitle}${isComplete ? ' (completed)' : ''}`);

    const numBadge = btn.querySelector('.nav-num');
    if (numBadge) {
      const idx = State.lessons.findIndex(l => l.id === id);
      numBadge.textContent = isComplete ? '✓' : String(idx + 1);
    }
  });
}

/* ─── Router ────────────────────────────────────────────────────── */

async function navigateTo(lessonId) {
  if (lessonId === State.currentLessonId) return;

  State.currentLessonId = lessonId;
  history.pushState({ lessonId }, '', `#${lessonId}`);

  syncNavState();
  await loadAndRenderLesson(lessonId);
}

window.addEventListener('popstate', (e) => {
  const id = e.state?.lessonId ?? location.hash.slice(1);
  if (id && id !== State.currentLessonId) {
    State.currentLessonId = id;
    syncNavState();
    loadAndRenderLesson(id);
  }
});

/* ─── Lesson Loader (Smart Fetcher for Path Mismatches) ─────────── */

async function loadAndRenderLesson(lessonId) {
  hide(DOM.welcomeSplash());
  hide(DOM.lessonWrapper());
  hide(DOM.errorState());
  show(DOM.loadingState());

  try {
    let data = null;
    const capitalizedId = lessonId.charAt(0).toUpperCase() + lessonId.slice(1); // 'lesson1' -> 'Lesson1'
    
    // Array of paths to try, fixing common case-sensitivity deployment errors
    const pathsToTry = [
      `${CONFIG.DATA_BASE}/${CONFIG.LESSONS_FOLDER}/${lessonId}.json`,     // data/lessons/lesson1.json
      `${CONFIG.DATA_BASE}/Lessons/${lessonId}.json`,                      // data/Lessons/lesson1.json
      `${CONFIG.DATA_BASE}/Lessons/${capitalizedId}.json`,                 // data/Lessons/Lesson1.json
      `${CONFIG.DATA_BASE}/${CONFIG.LESSONS_FOLDER}/${capitalizedId}.json` // data/lessons/Lesson1.json
    ];

    for (const path of pathsToTry) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          data = await res.json();
          break; // Break the loop once we successfully find the file!
        }
      } catch (e) {
        // Network error for this path, ignore and try the next one
      }
    }

    if (!data) {
      throw new Error("File not found. Searched multiple paths, verify file exists.");
    }

    renderLesson(data);
    show(DOM.lessonWrapper());
    
  } catch (err) {
    console.error('[Learn Pashto Today] Failed to load lesson:', err);
    DOM.errorMessage().textContent = `Could not load "${lessonId}". ${err.message}`;
    show(DOM.errorState());
  } finally {
    hide(DOM.loadingState());
    DOM.lessonWrapper()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ─── Rendering Engine ──────────────────────────────────────────── */

function renderLesson(data) {
  const card   = DOM.lessonCard();
  const footer = DOM.lessonFooter();
  if (!card) return;

  card.innerHTML = '';

  card.append(renderLessonHeader(data));

  if (Array.isArray(data.content) && data.content.length > 0) {
    const blocksWrap = el('div', { className: 'content-blocks' });
    data.content.forEach((block, i) => {
      const rendered = renderBlock(block, i);
      if (rendered) blocksWrap.append(rendered);
    });
    card.append(blocksWrap);
  }

  // Uses State.currentLessonId to ensure we match the nav index
  if (State.isComplete(State.currentLessonId)) {
    card.append(renderCompletedBanner());
  }

  wireFinishButton(State.currentLessonId);
}

function renderLessonHeader(data) {
  const header = el('div', { className: 'lesson-header' });

  if (data.category) {
    header.append(el('p', { className: 'lesson-category' }, sanitize(data.category)));
  }

  header.append(el('h1', { className: 'lesson-title' }, sanitize(data.title ?? 'Untitled Lesson')));

  if (data.description) {
    header.append(el('p', { className: 'lesson-description' }, sanitize(data.description)));
  }

  const metaFields = [
    data.duration && { icon: '⏱', text: data.duration },
    data.level    && { icon: '◈', text: data.level },
    data.author   && { icon: '✦', text: data.author },
  ].filter(Boolean);

  if (metaFields.length > 0) {
    const metaRow = el('div', { className: 'lesson-meta' });
    metaFields.forEach(({ icon, text }) => {
      metaRow.append(el('span', { className: 'meta-chip' }, `${icon} ${sanitize(text)}`));
    });
    header.append(metaRow);
  }

  return header;
}

function renderBlock(block, idx) {
  if (!block || typeof block.type !== 'string') return null;

  const wrappers = {
    paragraph: renderParagraphBlock,
    callout:   renderCalloutBlock,
    image:     renderImageBlock,
    audio:     renderAudioBlock,
    video:     renderVideoBlock,
    quiz:      renderQuizBlock,
    divider:   renderDividerBlock,
  };

  const renderer = wrappers[block.type];
  if (!renderer) {
    console.warn(`[Learn Pashto Today] Unknown block type: "${block.type}" at index ${idx}`);
    return null;
  }

  return renderer(block, idx);
}

/* ── Block Renderers ─────────────────────────────────────────────── */

function renderParagraphBlock(block) {
  const wrapper = el('div', { className: 'block-paragraph' });

  if (block.heading) {
    wrapper.append(el('h3', {}, sanitize(block.heading)));
  }

  const lines = Array.isArray(block.lines)
    ? block.lines
    : [block.text ?? ''].filter(Boolean);

  lines.forEach(line => {
    const p = el('p', {}, sanitize(line));
    wrapper.append(p);
  });

  return wrapper;
}

function renderCalloutBlock(block) {
  const wrapper = el('div', { className: 'block-callout' });
  wrapper.textContent = sanitize(block.text ?? '');
  return wrapper;
}

function renderDividerBlock() {
  return el('hr', { className: 'block-divider', 'aria-hidden': 'true' });
}

function renderImageBlock(block) {
  const wrapper = el('div', { className: 'block-image' });

  const img = el('img', {
    src:     sanitizeUrl(block.src), 
    alt:     block.alt ?? 'Lesson image',
    loading: 'lazy',
  });

  img.addEventListener('error', () => {
    const errorEl = el('div', { className: 'image-error' });
    errorEl.innerHTML = `<p>⚠ Image could not be loaded</p><code>${escapeHTML(block.src ?? '')}</code>`;
    img.replaceWith(errorEl);
  });

  wrapper.append(img);

  if (block.caption) {
    wrapper.append(el('p', { className: 'image-caption' }, sanitize(block.caption)));
  }

  return wrapper;
}

function renderAudioBlock(block) {
  const wrapper = el('div', { className: 'block-audio' });

  const iconWrap = el('div', { className: 'audio-icon', 'aria-hidden': 'true' });
  iconWrap.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 110 18A9 9 0 0112 3zm0 2a7 7 0 100 14A7 7 0 0012 5zm0 3a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4z"/></svg>`;

  const content = el('div', { className: 'audio-content' });

  if (block.title) {
    content.append(el('p', { className: 'audio-title' }, sanitize(block.title)));
  }

  const audio = el('audio', { controls: '' });
  audio.setAttribute('aria-label', sanitize(block.title ?? 'Audio player'));

  const sources = Array.isArray(block.sources) 
    ? block.sources 
    : (block.src ? [{ src: block.src, type: block.mimeType }] : []);
    
  sources.filter(s => s?.src).forEach(s => {
    const source = el('source', { src: sanitizeUrl(s.src) });
    if (s.type) source.setAttribute('type', sanitize(s.type));
    audio.append(source);
  });

  audio.append(document.createTextNode('Your browser does not support the audio element.'));

  content.append(audio);
  wrapper.append(iconWrap, content);
  return wrapper;
}

function renderVideoBlock(block) {
  const wrapper = el('div', { className: 'block-video' });
  const vWrap   = el('div', { className: 'video-wrapper' });

  if (block.youtubeId || block.embedUrl) {
    let embedUrl = sanitizeUrl(block.embedUrl);
    if (!embedUrl && block.youtubeId) {
      embedUrl = `https://www.youtube-nocookie.com/embed/${sanitize(block.youtubeId)}?rel=0&modestbranding=1`;
    }

    const iframe = el('iframe', {
      src:             embedUrl,
      title:           sanitize(block.title ?? 'Video player'),
      frameborder:     '0',
      allow:           'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: '',
      loading:         'lazy',
    });

    vWrap.append(iframe);
  } else if (block.src) {
    const video = el('video', { controls: '', preload: 'metadata' });
    video.setAttribute('aria-label', sanitize(block.title ?? 'Video player'));

    const sources = Array.isArray(block.sources) 
      ? block.sources 
      : (block.src ? [{ src: block.src, type: block.mimeType ?? 'video/mp4' }] : []);

    sources.filter(s => s?.src).forEach(s => {
      const source = el('source', { src: sanitizeUrl(s.src) });
      if (s.type) source.setAttribute('type', sanitize(s.type));
      video.append(source);
    });

    vWrap.append(video);
  }

  wrapper.append(vWrap);

  if (block.caption) {
    wrapper.append(el('p', { className: 'video-caption' }, sanitize(block.caption)));
  }

  return wrapper;
}

function renderQuizBlock(block, blockIdx) {
  const wrapper = el('div', { className: 'block-quiz' });

  const label = el('div', { className: 'quiz-label' });
  label.innerHTML = `<svg viewBox="0 0 20 20" width="12" style="fill:currentColor"><path d="M10 1a9 9 0 110 18A9 9 0 0110 1zm0 13a1 1 0 100 2 1 1 0 000-2zm1-9H9v5h2V5z"/></svg> Quiz`;

  wrapper.append(label);
  wrapper.append(el('p', { className: 'quiz-question' }, sanitize(block.question ?? '')));

  if (!Array.isArray(block.options) || block.options.length === 0) {
    wrapper.append(el('p', {}, 'No options provided.'));
    return wrapper;
  }

  const correctIdx = typeof block.correctIndex === 'number' ? block.correctIndex : 0;
  const quizId     = `quiz-${blockIdx}`;

  const optionsList = el('div', { className: 'quiz-options', id: quizId });

  block.options.forEach((optText, i) => {
    const btn = el('button', {
      className: 'quiz-option',
      type: 'button',
      'data-option-idx': String(i),
      'aria-label': `Option ${optionLetter(i)}: ${sanitize(optText)}`,
    });

    const letter = el('span', { className: 'option-letter', 'aria-hidden': 'true' }, optionLetter(i));
    const text   = el('span', { className: 'option-text' }, sanitize(optText));

    btn.append(letter, text);
    btn.addEventListener('click', () => handleQuizAnswer(btn, i, correctIdx, optionsList, feedbackEl, retryBtn, block.explanation));

    optionsList.append(btn);
  });

  wrapper.append(optionsList);

  const feedbackEl = el('div', { className: 'quiz-feedback', 'aria-live': 'polite' });
  feedbackEl.hidden = true;
  wrapper.append(feedbackEl);

  const retryBtn = el('button', { className: 'btn-retry', type: 'button' }, '↺ Try Again');
  retryBtn.hidden = true;
  retryBtn.addEventListener('click', () => resetQuiz(optionsList, feedbackEl, retryBtn));
  wrapper.append(retryBtn);

  return wrapper;
}

function handleQuizAnswer(clickedBtn, selectedIdx, correctIdx, optionsList, feedbackEl, retryBtn, explanation) {
  const allBtns = optionsList.querySelectorAll('.quiz-option');
  allBtns.forEach(b => {
    b.disabled = true;
    const idx = parseInt(b.dataset.optionIdx, 10);
    if (idx === correctIdx) {
      b.classList.add('correct');
    } else if (idx === selectedIdx) {
      b.classList.add('incorrect');
    } else {
      b.classList.add('dimmed');
    }
  });

  const isCorrect = selectedIdx === correctIdx;

  feedbackEl.hidden = false;
  feedbackEl.className = `quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`;

  let icon, message;
  if (isCorrect) {
    icon    = `<svg viewBox="0 0 20 20"><path d="M16.7 5.3a1 1 0 00-1.4 0L8 12.6 4.7 9.3a1 1 0 00-1.4 1.4l4 4a1 1 0 001.4 0l8-8a1 1 0 000-1.4z"/></svg>`;
    message = explanation ? `Correct! ${escapeHTML(explanation)}` : 'Correct! Well done.';
  } else {
    icon    = `<svg viewBox="0 0 20 20"><path d="M14.3 5.7a1 1 0 00-1.4 0L10 8.6 7.1 5.7a1 1 0 00-1.4 1.4L8.6 10l-2.9 2.9a1 1 0 001.4 1.4L10 11.4l2.9 2.9a1 1 0 001.4-1.4L11.4 10l2.9-2.9a1 1 0 000-1.4z"/></svg>`;
    message = explanation ? `Not quite. ${escapeHTML(explanation)}` : 'Not quite — give it another try!';
  }

  feedbackEl.innerHTML = `${icon}<span>${message}</span>`;

  if (!isCorrect) {
    retryBtn.hidden = false;
  }
}

function resetQuiz(optionsList, feedbackEl, retryBtn) {
  const allBtns = optionsList.querySelectorAll('.quiz-option');
  allBtns.forEach(b => {
    b.disabled = false;
    b.classList.remove('correct', 'incorrect', 'dimmed');
  });
  feedbackEl.hidden = true;
  feedbackEl.textContent = '';
  retryBtn.hidden = true;
}

/* ── Completed Banner ─────────────────────────────────────────────── */
function renderCompletedBanner() {
  const banner = el('div', { className: 'completed-banner', role: 'status' });
  banner.innerHTML = `
    <svg viewBox="0 0 20 20"><path d="M10 1a9 9 0 110 18A9 9 0 0110 1zm4.7 5.7a1 1 0 00-1.4 0L9 11 6.7 8.7a1 1 0 10-1.4 1.4l3 3a1 1 0 001.4 0l5-5a1 1 0 000-1.4z"/></svg>
    <span>You have completed this lesson. Great work!</span>
  `;
  return banner;
}

/* ─── Finish Button ─────────────────────────────────────────────── */

function wireFinishButton(lessonId) {
  const btn = DOM.btnFinish();
  if (!btn) return;

  btn.classList.remove('is-done');
  btn.disabled = false;

  const alreadyDone = State.isComplete(lessonId);

  if (alreadyDone) {
    btn.classList.add('is-done');
    btn.innerHTML = `
      <svg viewBox="0 0 20 20"><path d="M10 1a9 9 0 110 18A9 9 0 0110 1zm4.7 5.7a1 1 0 00-1.4 0L9 11 6.7 8.7a1 1 0 10-1.4 1.4l3 3a1 1 0 001.4 0l5-5a1 1 0 000-1.4z"/></svg>
      Lesson Completed
    `;
    return;
  }

  btn.innerHTML = `
    <svg viewBox="0 0 20 20"><path d="M16.7 5.3a1 1 0 00-1.4 0L8 12.6 4.7 9.3a1 1 0 00-1.4 1.4l4 4a1 1 0 001.4 0l8-8a1 1 0 000-1.4z"/></svg>
    Mark Lesson Complete
  `;

  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => completeLesson(lessonId, newBtn), { once: true });
}

function completeLesson(lessonId, btn) {
  State.markComplete(lessonId);
  syncNavState();
  updateProgressUI();

  btn.classList.add('is-done');
  btn.innerHTML = `
    <svg viewBox="0 0 20 20"><path d="M10 1a9 9 0 110 18A9 9 0 0110 1zm4.7 5.7a1 1 0 00-1.4 0L9 11 6.7 8.7a1 1 0 10-1.4 1.4l3 3a1 1 0 001.4 0l5-5a1 1 0 000-1.4z"/></svg>
    Lesson Completed
  `;
  btn.disabled = true;

  const card = DOM.lessonCard();
  if (card && !card.querySelector('.completed-banner')) {
    card.append(renderCompletedBanner());
    card.querySelector('.completed-banner')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ─── Initialization ────────────────────────────────────────────── */

async function init() {
  State.load();

  try {
    const indexData = await fetchJSON(`${CONFIG.DATA_BASE}/${CONFIG.INDEX_FILE}`);

    if (!Array.isArray(indexData.lessons)) {
      throw new Error('index.json must have a "lessons" array.');
    }

    State.lessons = indexData.lessons;
  } catch (err) {
    console.error('[Learn Pashto Today] Failed to load index.json:', err);
    DOM.errorMessage().textContent = `Could not load course index: ${err.message}`;
    hide(DOM.navList()?.querySelector('.nav-skeleton')?.parentElement);
    hide(DOM.welcomeSplash());
    show(DOM.errorState());
    return;
  }

  buildNav();
  updateProgressUI();

  const hash = location.hash.slice(1);
  if (hash && State.lessons.some(l => l.id === hash)) {
    State.currentLessonId = hash;
    syncNavState();
    await loadAndRenderLesson(hash);
  } else {
    hide(DOM.loadingState());
    show(DOM.welcomeSplash());
  }
}

/* ─── Boot ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);