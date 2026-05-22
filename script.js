/**
 * ════════════════════════════════════════════════════════════════
 * Learn Pashto Today — script.js
 * SPA Engine: Router · JSON Fetcher · Content Renderer · Quiz · State
 * Architecture: Pure ES6+ Vanilla JS (no dependencies)
 * GAMIFIED VERSION: XP, Streaks, Time-Attack, Spaced Repetition
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

/* ─── Gamified State ────────────────────────────────────────────── */
const State = {
  lessons: [],
  currentLessonId: null,
  completedIds: new Set(),
  
  // Gamification tracking
  xp: 0,
  streakCount: 0,
  lastActiveDate: null,
  struggledQuestions: [], // Stores failed quiz blocks for Spaced Repetition

  save() {
    try {
      const data = {
        completed: [...this.completedIds],
        xp: this.xp,
        streakCount: this.streakCount,
        lastActiveDate: this.lastActiveDate,
        struggledQuestions: this.struggledQuestions
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Learn Pashto Today] localStorage unavailable:', e);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Backward compatibility for old simple array structure
        if (Array.isArray(parsed)) {
          this.completedIds = new Set(parsed);
        } else {
          this.completedIds = new Set(parsed.completed || []);
          this.xp = parsed.xp || 0;
          this.streakCount = parsed.streakCount || 0;
          this.lastActiveDate = parsed.lastActiveDate || null;
          this.struggledQuestions = parsed.struggledQuestions || [];
        }
      }
      this.checkDailyStreak();
    } catch (e) {
      console.warn('[Learn Pashto Today] Could not read localStorage:', e);
    }
  },

  checkDailyStreak() {
    const today = new Date().toDateString();
    if (this.lastActiveDate === today) return; // Already played today
    
    if (this.lastActiveDate) {
      const last = new Date(this.lastActiveDate);
      const diffTime = Math.abs(new Date() - last);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays === 1) {
        this.streakCount++;
      } else {
        this.streakCount = 1; // Streak broken
      }
    } else {
      this.streakCount = 1; // First time playing
    }
    this.lastActiveDate = today;
    this.save();
  },

  markComplete(lessonId) {
    if (!this.completedIds.has(lessonId)) {
      this.completedIds.add(lessonId);
      this.xp += 50; // +50 XP for finishing a lesson for the first time
      this.save();
      updateStatsUI();
    }
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

/* ─── Gamification UI & Audio FX ────────────────────────────────── */

// Zero-dependency sound effects using the browser's native audio synthesizer
const AudioFX = {
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  playTone(freq, type, duration, vol) {
    if(this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  correct() { 
    this.playTone(600, 'sine', 0.1, 0.1); 
    setTimeout(() => this.playTone(800, 'sine', 0.2, 0.1), 100); 
  },
  wrong() { 
    this.playTone(200, 'sawtooth', 0.3, 0.1); 
  }
};

function updateStatsUI() {
  const xpEl = document.getElementById('xp-display');
  const streakEl = document.getElementById('streak-display');
  if (xpEl) xpEl.textContent = `⭐ ${State.xp} XP`;
  if (streakEl) streakEl.textContent = `🔥 ${State.streakCount}`;
}

/* ─── Utilities ─────────────────────────────────────────────────── */
async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
  return res.json();
}

function sanitizeUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  const dangerousProtocols = /^(javascript|vbscript|data):/i;
  if (dangerousProtocols.test(url.trim())) return '#';
  return url;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  const doc = new DOMParser().parseFromString(str, 'text/html');
  return doc.documentElement.textContent || '';
}

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

function show(node) { if(node) node.hidden = false; }
function hide(node) { if(node) node.hidden = true; }

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

  // 🔴 DYNAMIC REVIEW INJECTION (Spaced Repetition)
  if (State.struggledQuestions.length > 0) {
    const revItem = el('li', { className: 'nav-item', style: 'margin-bottom: 8px;' });
    const revBtn = el('button', { className: 'nav-item-btn', type: 'button', 'data-lesson-id': 'review' });
    revBtn.innerHTML = `
      <span class="nav-num" style="background:var(--terracotta); color:white;">!</span>
      <span class="nav-label-text">
        <span class="nav-label-category" style="color:var(--terracotta);">Spaced Repetition</span>
        Review Weak Points
      </span>`;
    revBtn.addEventListener('click', () => navigateTo('review'));
    revItem.append(revBtn);
    list.append(revItem);
  }

  // Generate normal lessons
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
    
    // Skip completion styling for the dynamic review button
    const isComplete  = id !== 'review' ? State.isComplete(id) : false;

    btn.classList.toggle('active', isActive);
    btn.classList.toggle('completed', isComplete);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    
    if (id !== 'review') {
      const lessonTitle = State.lessons.find(l => l.id === id)?.title ?? id;
      btn.setAttribute('aria-label', `${lessonTitle}${isComplete ? ' (completed)' : ''}`);

      const numBadge = btn.querySelector('.nav-num');
      if (numBadge) {
        const idx = State.lessons.findIndex(l => l.id === id);
        numBadge.textContent = isComplete ? '✓' : String(idx + 1);
      }
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

/* ─── Lesson Loader (Smart Fetcher & Dynamic Review) ────────────── */
async function loadAndRenderLesson(lessonId) {
  hide(DOM.welcomeSplash());
  hide(DOM.lessonWrapper());
  hide(DOM.errorState());
  show(DOM.loadingState());

  // 🔴 INTERCEPT: Dynamic Review Generator
  if (lessonId === 'review') {
    const virtualData = {
        title: "Dynamic Review Session",
        category: "Spaced Repetition",
        description: "These are questions you missed recently. Answer them correctly to clear your queue!",
        content: State.struggledQuestions
    };
    hide(DOM.loadingState());
    renderLesson(virtualData);
    if(DOM.btnFinish()) DOM.btnFinish().hidden = true; // Hide finish button for review pages
    show(DOM.lessonWrapper());
    return;
  }

  // Ensure button is visible for normal lessons
  if(DOM.btnFinish()) DOM.btnFinish().hidden = false; 

  try {
    let data = null;
    const capitalizedId = lessonId.charAt(0).toUpperCase() + lessonId.slice(1); 
    
    const pathsToTry = [
      `${CONFIG.DATA_BASE}/${CONFIG.LESSONS_FOLDER}/${lessonId}.json`,     
      `${CONFIG.DATA_BASE}/Lessons/${lessonId}.json`,                      
      `${CONFIG.DATA_BASE}/Lessons/${capitalizedId}.json`,                 
      `${CONFIG.DATA_BASE}/${CONFIG.LESSONS_FOLDER}/${capitalizedId}.json` 
    ];

    for (const path of pathsToTry) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          data = await res.json();
          break; 
        }
      } catch (e) {}
    }

    if (!data) throw new Error("File not found. Searched multiple paths, verify file exists.");

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

/* ── Static Block Renderers ──────────────────────────────────────── */
function renderParagraphBlock(block) {
  const wrapper = el('div', { className: 'block-paragraph' });

  if (block.heading) wrapper.append(el('h3', {}, sanitize(block.heading)));

  const lines = Array.isArray(block.lines) ? block.lines : [block.text ?? ''].filter(Boolean);
  lines.forEach(line => wrapper.append(el('p', {}, sanitize(line))));

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
  const img = el('img', { src: sanitizeUrl(block.src), alt: block.alt ?? 'Lesson image', loading: 'lazy' });

  img.addEventListener('error', () => {
    const errorEl = el('div', { className: 'image-error' });
    errorEl.innerHTML = `<p>⚠ Image could not be loaded</p><code>${escapeHTML(block.src ?? '')}</code>`;
    img.replaceWith(errorEl);
  });

  wrapper.append(img);
  if (block.caption) wrapper.append(el('p', { className: 'image-caption' }, sanitize(block.caption)));
  return wrapper;
}

function renderAudioBlock(block) {
  const wrapper = el('div', { className: 'block-audio' });
  const iconWrap = el('div', { className: 'audio-icon', 'aria-hidden': 'true' });
  iconWrap.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 110 18A9 9 0 0112 3zm0 2a7 7 0 100 14A7 7 0 0012 5zm0 3a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4z"/></svg>`;
  
  const content = el('div', { className: 'audio-content' });
  if (block.title) content.append(el('p', { className: 'audio-title' }, sanitize(block.title)));

  const audio = el('audio', { controls: '' });
  audio.setAttribute('aria-label', sanitize(block.title ?? 'Audio player'));

  const sources = Array.isArray(block.sources) ? block.sources : (block.src ? [{ src: block.src, type: block.mimeType }] : []);
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
    if (!embedUrl && block.youtubeId) embedUrl = `https://www.youtube-nocookie.com/embed/${sanitize(block.youtubeId)}?rel=0&modestbranding=1`;

    const iframe = el('iframe', {
      src: embedUrl, title: sanitize(block.title ?? 'Video player'), frameborder: '0',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: '', loading: 'lazy'
    });
    vWrap.append(iframe);
  } else if (block.src) {
    const video = el('video', { controls: '', preload: 'metadata' });
    video.setAttribute('aria-label', sanitize(block.title ?? 'Video player'));

    const sources = Array.isArray(block.sources) ? block.sources : (block.src ? [{ src: block.src, type: block.mimeType ?? 'video/mp4' }] : []);
    sources.filter(s => s?.src).forEach(s => {
      const source = el('source', { src: sanitizeUrl(s.src) });
      if (s.type) source.setAttribute('type', sanitize(s.type));
      video.append(source);
    });
    vWrap.append(video);
  }

  wrapper.append(vWrap);
  if (block.caption) wrapper.append(el('p', { className: 'video-caption' }, sanitize(block.caption)));
  return wrapper;
}

/* ── Interactive Quiz Renderer (Time Attack) ─────────────────────── */
function renderQuizBlock(block, blockIdx) {
  const wrapper = el('div', { className: 'block-quiz' });

  const label = el('div', { className: 'quiz-label' });
  label.innerHTML = `<svg viewBox="0 0 20 20" width="12" style="fill:currentColor"><path d="M10 1a9 9 0 110 18A9 9 0 0110 1zm0 13a1 1 0 100 2 1 1 0 000-2zm1-9H9v5h2V5z"/></svg> Quiz`;
  wrapper.append(label);

  // Time Attack UI
  const timerWrap = el('div', { className: 'quiz-timer-wrap' });
  const timerFill = el('div', { className: 'quiz-timer-fill' });
  timerWrap.append(timerFill);
  wrapper.append(timerWrap);

  wrapper.append(el('p', { className: 'quiz-question' }, sanitize(block.question ?? '')));

  if (!Array.isArray(block.options) || block.options.length === 0) {
    wrapper.append(el('p', {}, 'No options provided.'));
    return wrapper;
  }

  const correctIdx = typeof block.correctIndex === 'number' ? block.correctIndex : 0;
  const optionsList = el('div', { className: 'quiz-options', id: `quiz-${blockIdx}` });

  // Time Attack Logic Engine
  let timeLeft = 100; // 100%
  let isAnswered = false;
  let startTime = Date.now();
  
  const timerInterval = setInterval(() => {
    if (isAnswered) return clearInterval(timerInterval);
    const elapsed = Date.now() - startTime;
    timeLeft = Math.max(0, 100 - (elapsed / 100)); // 10 seconds to answer (10000ms = 100)
    timerFill.style.width = `${timeLeft}%`;
    if (timeLeft < 30) timerFill.classList.add('hurry');
    if (timeLeft === 0) clearInterval(timerInterval); // Time's up!
  }, 50);

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
    
    btn.addEventListener('click', (e) => {
      if (isAnswered) return;
      isAnswered = true;
      clearInterval(timerInterval);
      handleQuizAnswer(btn, i, correctIdx, optionsList, feedbackEl, retryBtn, block, timeLeft, wrapper, e);
    });

    optionsList.append(btn);
  });

  wrapper.append(optionsList);

  const feedbackEl = el('div', { className: 'quiz-feedback', 'aria-live': 'polite' });
  feedbackEl.hidden = true;
  wrapper.append(feedbackEl);

  const retryBtn = el('button', { className: 'btn-retry', type: 'button' }, '↺ Try Again');
  retryBtn.hidden = true;
  retryBtn.addEventListener('click', () => {
      resetQuiz(optionsList, feedbackEl, retryBtn);
      isAnswered = false; 
      wrapper.classList.remove('shake-animation'); // Reset animation state
      
      // Reset Timer visually
      startTime = Date.now();
      timerFill.classList.remove('hurry');
      timerFill.style.width = `100%`;
  });
  wrapper.append(retryBtn);

  return wrapper;
}

function handleQuizAnswer(clickedBtn, selectedIdx, correctIdx, optionsList, feedbackEl, retryBtn, blockData, timeScore, wrapperEl, event) {
  const allBtns = optionsList.querySelectorAll('.quiz-option');
  allBtns.forEach(b => {
    b.disabled = true;
    const idx = parseInt(b.dataset.optionIdx, 10);
    if (idx === correctIdx) b.classList.add('correct');
    else if (idx === selectedIdx) b.classList.add('incorrect');
    else b.classList.add('dimmed');
  });

  const isCorrect = selectedIdx === correctIdx;
  feedbackEl.hidden = false;
  feedbackEl.className = `quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`;

  let icon, message;
  
  if (isCorrect) {
    icon = `<svg viewBox="0 0 20 20"><path d="M16.7 5.3a1 1 0 00-1.4 0L8 12.6 4.7 9.3a1 1 0 00-1.4 1.4l4 4a1 1 0 001.4 0l8-8a1 1 0 000-1.4z"/></svg>`;
    message = blockData.explanation ? `Correct! ${escapeHTML(blockData.explanation)}` : 'Correct! Well done.';
    
    AudioFX.correct(); 

    // Point calculations
    let points = 10; 
    let xpMsg = "+10 XP";
    if (timeScore > 60) { 
      points = 20; 
      xpMsg = "SPEED BONUS! +20 XP"; 
    }
    
    State.xp += points;
    State.save();
    updateStatsUI();

    // Floating Points UI 
    const popup = el('div', { className: 'xp-popup' }, xpMsg);
    clickedBtn.style.position = 'relative';
    clickedBtn.append(popup);
    setTimeout(() => popup.remove(), 1000);

    // Spaced Repetition: Remove from queue if answered correctly
    const initialQueueLength = State.struggledQuestions.length;
    State.struggledQuestions = State.struggledQuestions.filter(q => q.question !== blockData.question);
    
    if (State.struggledQuestions.length !== initialQueueLength) {
      State.save();
      buildNav(); // Refresh nav to remove the review button if queue is empty
    }

  } else {
    icon = `<svg viewBox="0 0 20 20"><path d="M14.3 5.7a1 1 0 00-1.4 0L10 8.6 7.1 5.7a1 1 0 00-1.4 1.4L8.6 10l-2.9 2.9a1 1 0 001.4 1.4L10 11.4l2.9 2.9a1 1 0 001.4-1.4L11.4 10l2.9-2.9a1 1 0 000-1.4z"/></svg>`;
    message = blockData.explanation ? `Not quite. ${escapeHTML(blockData.explanation)}` : 'Not quite — give it another try!';
    
    AudioFX.wrong(); 
    
    // Screen Shake
    wrapperEl.classList.remove('shake-animation'); 
    void wrapperEl.offsetWidth; // trigger reflow
    wrapperEl.classList.add('shake-animation');

    // Spaced Repetition: Add question to review queue if not already there
    const alreadySaved = State.struggledQuestions.find(q => q.question === blockData.question);
    if (!alreadySaved) {
        State.struggledQuestions.push(blockData);
        State.save();
        buildNav(); // Refresh nav to show the red "!" Review button
    }
    
    retryBtn.hidden = false;
  }

  feedbackEl.innerHTML = `${icon}<span>${message}</span>`;
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

/* ── Completed Banner & Footer ───────────────────────────────────── */
function renderCompletedBanner() {
  const banner = el('div', { className: 'completed-banner', role: 'status' });
  banner.innerHTML = `
    <svg viewBox="0 0 20 20"><path d="M10 1a9 9 0 110 18A9 9 0 0110 1zm4.7 5.7a1 1 0 00-1.4 0L9 11 6.7 8.7a1 1 0 10-1.4 1.4l3 3a1 1 0 001.4 0l5-5a1 1 0 000-1.4z"/></svg>
    <span>You have completed this lesson. Great work!</span>
  `;
  return banner;
}

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
  updateStatsUI(); // Initialize header badges!

  const hash = location.hash.slice(1);
  if (hash && (State.lessons.some(l => l.id === hash) || hash === 'review')) {
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