import { createApi, todayIst, addDays } from './api.js';
import { compressImage } from './image.js';
import { TEAM_NAME } from './config.js';

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');

let api;
let meId = null;

// ---------- small helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const icon = (name, extra = '') => `<span class="icon ${extra}" aria-hidden="true">${name}</span>`;

const PROGRESS = { just_started: 'Just started', midway: 'Midway', almost_done: 'Almost done' };

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_TINTS = ['#ffdbca', '#a7f0e6', '#dce2f3', '#f3e3b6', '#e8d5f0', '#d4ecd0'];

function avatar(member, size = 40) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  if (member?.avatarUrl) {
    return `<img class="avatar" style="${style}" src="${esc(member.avatarUrl)}" alt="" loading="lazy">`;
  }
  const name = member?.name || '?';
  const tint = AVATAR_TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return `<span class="avatar avatar-initials" style="${style};background:${tint}">${esc(initials(name))}</span>`;
}

function streakPill(n, big = false) {
  return `<span class="streak-pill ${big ? 'big' : ''} ${n ? '' : 'zero'}" title="${n}-day streak">${icon('local_fire_department', 'filled')}${n}${big ? (n === 1 ? ' day' : ' days') : ''}</span>`;
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function setChrome({ title = '', tabs = false, active = '' } = {}) {
  topbar.innerHTML = `
    <a class="brand" href="#/feed">${icon('auto_stories')}<span>Reading App</span></a>
    ${title ? `<span class="crumb">/ ${esc(title)}</span>` : ''}
    <span class="spacer"></span>
    <span id="topbar-me"></span>`;
  topbar.hidden = false;
  tabbar.hidden = !tabs;
  tabbar.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === active));
}

function loading() {
  view.innerHTML = `<div class="loading">${icon('progress_activity', 'spin')}</div>`;
}

function showError(err) {
  console.error(err);
  view.innerHTML = `<div class="empty card">
    <p class="headline-sm">Something went wrong</p>
    <p class="muted">${esc(err.message || err)}</p>
    <button class="btn btn-secondary" onclick="location.reload()">Try again</button></div>`;
}

async function loadMembers() {
  const members = await api.listMembers();
  const byId = new Map(members.map((m) => [m.id, m]));
  const me = byId.get(meId);
  const slot = document.getElementById('topbar-me');
  if (slot && me) slot.innerHTML = `<a href="#/profile" aria-label="Your profile">${avatar(me, 34)}</a>`;
  return { members, byId, me };
}

// Lets a member pick or take a photo. Resolves with a compressed JPEG blob, or null.
function pickImage(maxSize) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await compressImage(file, maxSize));
      } catch (err) {
        toast(err.message);
        resolve(null);
      }
    };
    input.click();
  });
}

// ---------- router ----------

const routes = {
  welcome: renderWelcome,
  join: renderJoin,
  feed: renderFeed,
  post: renderPost,
  profile: renderProfile,
};

async function route() {
  const [name = '', param] = location.hash.replace(/^#\/?/, '').split('/');
  const publicRoute = name === 'welcome' || name === 'join';
  if (!meId && !publicRoute) return void (location.hash = '#/welcome');
  if (meId && (publicRoute || !routes[name])) return void (location.hash = '#/feed');
  window.scrollTo(0, 0);
  try {
    await routes[name](param);
  } catch (err) {
    showError(err);
  }
}

// ---------- welcome ----------

function renderWelcome() {
  topbar.hidden = true;
  tabbar.hidden = true;
  view.innerHTML = `
    <div class="welcome">
      <div class="welcome-top">
        <span class="brand">${icon('auto_stories')}<span>Reading App</span></span>
        <span class="chip">${icon('circle', 'filled dot')}${esc(TEAM_NAME)}</span>
      </div>
      <div class="hero" aria-hidden="true">
        <svg viewBox="0 0 320 170" role="img">
          <rect x="0" y="0" width="320" height="170" rx="20" fill="#efe9df"/>
          <circle cx="262" cy="46" r="26" fill="#ffdbca"/>
          <path d="M60 130 Q160 100 160 112 Q160 100 260 130 L260 64 Q160 36 160 52 Q160 36 60 64 Z" fill="#fff" stroke="#d9d2c5" stroke-width="2"/>
          <path d="M160 52 L160 112" stroke="#d9d2c5" stroke-width="2"/>
          <g stroke="#bec9c6" stroke-width="3" stroke-linecap="round">
            <line x1="80" y1="74" x2="140" y2="64"/><line x1="80" y1="88" x2="140" y2="78"/><line x1="80" y1="102" x2="128" y2="94"/>
            <line x1="180" y1="64" x2="240" y2="74"/><line x1="180" y1="78" x2="240" y2="88"/><line x1="180" y1="92" x2="226" y2="100"/>
          </g>
          <path d="M226 34 q8 -14 0 -26 q14 10 10 26 q8 -4 6 -12 q10 14 -2 26 q-12 8 -18 -2 q-4 -6 4 -12z" fill="#e06d24"/>
        </svg>
      </div>
      <h1 class="display">Read daily. Learn together.</h1>
      <p class="lead">A lightweight ritual for our team: log the book you're reading, share one learning a day, and keep your streak alive.</p>
      <div class="feature-list">
        ${feature('local_fire_department', 'amber', 'Daily streaks', 'Post one learning a day to keep your flame going.')}
        ${feature('edit_note', 'grey', 'One learning at a time', 'A few lines, plus a photo of the page if you like.')}
        ${feature('groups', 'teal', 'Shared team feed', 'See what everyone is reading and learning.')}
      </div>
      <a class="btn btn-primary btn-block" href="#/join">Get started ${icon('arrow_forward')}</a>
      ${api.isDemo ? `<p class="demo-note">Demo mode: sample data saved only in this browser. Add your Supabase keys in <code>js/config.js</code> to go live.</p>` : ''}
    </div>`;
}

function feature(name, tone, title, text) {
  return `<div class="feature card">
    <span class="feature-icon ${tone}">${icon(name)}</span>
    <div><p class="label-lg">${title}</p><p class="muted">${text}</p></div></div>`;
}

// ---------- join ----------

function renderJoin() {
  topbar.hidden = true;
  tabbar.hidden = true;
  let avatarBlob = null;
  view.innerHTML = `
    <div class="page-head">
      <a class="icon-btn" href="#/welcome" aria-label="Back">${icon('arrow_back')}</a>
      <h1 class="headline-md">Get started</h1>
      <span class="icon-btn"></span>
    </div>
    <h2 class="display">Welcome! Let's get you set up.</h2>
    <p class="muted">Takes 30 seconds. No password needed.</p>
    <form id="join-form" class="stack" novalidate>
      <button type="button" class="avatar-picker" id="avatar-picker" aria-label="Add your photo">
        <span id="avatar-preview">${avatar({ name: '?' }, 112)}</span>
        <span class="avatar-cam">${icon('photo_camera')}</span>
      </button>
      <p class="center"><span class="label-lg">Add your photo</span><br><span class="muted small">Optional. Tap the circle, or keep your initials.</span></p>
      <div class="card stack">
        <label class="field"><span class="field-label">Your name <em>Required</em></span>
          <span class="input-wrap">${icon('person')}<input name="name" maxlength="60" autocomplete="name" placeholder="e.g. Alex Morgan" required></span></label>
        <label class="field"><span class="field-label">Book you're reading <em>Required</em></span>
          <span class="input-wrap">${icon('menu_book')}<input name="title" maxlength="200" placeholder="e.g. Thinking, Fast and Slow" required></span></label>
        <label class="field"><span class="input-wrap">${icon('stylus_note')}<input name="author" maxlength="120" placeholder="Author (optional)"></span></label>
        <fieldset class="field"><legend class="field-label">Where are you right now? <span class="muted">(optional)</span></legend>
          ${progressPicker()}
        </fieldset>
      </div>
      <p class="form-error" id="join-error" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Join the team feed ${icon('arrow_forward')}</button>
      <p class="muted small center">${icon('lock', 'inline')} Visible only to your team. You can change your book any time.</p>
    </form>`;

  const form = document.getElementById('join-form');
  const nameInput = form.elements.name;
  const refreshInitials = () => {
    if (!avatarBlob) document.getElementById('avatar-preview').innerHTML = avatar({ name: nameInput.value || '?' }, 112);
  };
  nameInput.addEventListener('input', refreshInitials);
  form.addEventListener('input', () => (document.getElementById('join-error').hidden = true));
  document.getElementById('avatar-picker').addEventListener('click', async () => {
    const blob = await pickImage(400);
    if (!blob) return;
    avatarBlob = blob;
    document.getElementById('avatar-preview').innerHTML = avatar({ avatarUrl: URL.createObjectURL(blob) }, 112);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const bookTitle = form.elements.title.value.trim();
    const errorEl = document.getElementById('join-error');
    if (!name || !bookTitle) {
      errorEl.textContent = 'Please add your name and the book you are reading.';
      errorEl.hidden = false;
      return;
    }
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      meId = await api.join({
        name,
        bookTitle,
        bookAuthor: form.elements.author.value.trim(),
        progress: form.elements.progress.value || null,
        avatarBlob,
      });
      location.hash = '#/feed';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      button.disabled = false;
    }
  });
}

function progressPicker(selected = '') {
  return `<div class="segmented">${Object.entries(PROGRESS)
    .map(([value, label], i) => `<label><input type="radio" name="progress" value="${value}" ${selected === value ? 'checked' : ''}>
      <span>${icon(['wb_twilight', 'bookmark', 'check_circle'][i])}${label}</span></label>`)
    .join('')}</div>`;
}

// ---------- feed ----------

async function renderFeed() {
  setChrome({ title: 'Feed', tabs: true, active: 'feed' });
  loading();
  const [{ members, byId, me }, learnings] = await Promise.all([loadMembers(), api.listFeed()]);
  const postedToday = members.filter((m) => m.postedToday).length;
  const ordered = members.slice().sort((a, b) => (b.postedToday - a.postedToday) || (b.currentStreak - a.currentStreak));
  const others = ordered.filter((m) => m.id !== meId);

  view.innerHTML = `
    <section class="feed-head">
      <div><h1 class="headline-lg">Team feed</h1><p class="muted small">${esc(TEAM_NAME)} · ${members.length} ${members.length === 1 ? 'member' : 'members'}</p></div>
      ${streakPill(me.currentStreak, true)}
    </section>
    <div class="today-label"><span>POSTED TODAY (${postedToday}/${members.length})</span></div>
    <div class="today-row">
      <a class="today-person ${me.postedToday ? 'done' : 'you'}" href="${me.postedToday ? '#/profile' : '#/post'}">
        <span class="ring">${me.postedToday ? avatar(me, 52) : `<span class="add-circle">${icon('add')}</span>`}</span><span>You</span></a>
      ${others.map((m) => `<a class="today-person ${m.postedToday ? 'done' : 'pending'}" href="#/profile/${esc(m.id)}">
        <span class="ring">${avatar(m, 52)}</span><span>${esc(m.name.split(' ')[0])}</span></a>`).join('')}
    </div>
    <div class="cards">
      ${learnings.length ? learnings.map((l) => learningCard(l, byId.get(l.userId))).join('') : `
        <div class="empty card"><p class="headline-sm">No learnings yet</p><p class="muted">Be the first to share what you read today.</p>
        <a class="btn btn-primary" href="#/post">Share a learning</a></div>`}
    </div>
    ${learnings.length ? `<div class="caught-up">${icon('done_all')}<p class="label-lg">You're caught up</p>
      <p class="muted small">${me.postedToday ? 'You have posted today. See you tomorrow!' : 'Tap + below to share your takeaway for today.'}</p></div>` : ''}`;
}

function learningCard(l, author, { showAuthor = true } = {}) {
  const mine = l.userId === meId;
  return `<article class="card learning" data-id="${esc(l.id)}">
    ${showAuthor ? `<header class="learning-head">
      <a href="#/profile/${esc(l.userId)}">${avatar(author, 40)}</a>
      <div class="who"><a class="label-lg" href="#/profile/${esc(l.userId)}">${esc(author?.name || 'Former member')}</a>
        ${author ? streakPill(author.currentStreak) : ''}<span class="muted small block">${timeAgo(l.createdAt)}</span></div>
      ${mine ? `<button class="icon-btn" data-action="delete" aria-label="Delete this learning">${icon('more_horiz')}</button>` : ''}
    </header>` : `<header class="learning-head compact"><span class="muted small">${timeAgo(l.createdAt)}${l.chapter ? ' · ' + esc(l.chapter) : ''}</span>
      ${mine ? `<button class="icon-btn" data-action="delete" aria-label="Delete this learning">${icon('more_horiz')}</button>` : ''}</header>`}
    ${showAuthor && l.book ? `<p class="book-chip">${icon('menu_book')}<span><b>${esc(l.book.title)}</b>${l.book.author ? ' by ' + esc(l.book.author) : ''}${l.chapter ? ' · ' + esc(l.chapter) : ''}</span></p>` : ''}
    <blockquote class="quote">${esc(l.body)}</blockquote>
    ${l.photoUrl ? `<button class="photo" data-action="photo" data-src="${esc(l.photoUrl)}" aria-label="View photo full screen"><img src="${esc(l.photoUrl)}" alt="Photo shared with this learning" loading="lazy"></button>` : ''}
    <footer class="learning-foot">
      <button class="react ${l.insightfulByMe ? 'on' : ''}" data-action="insightful" aria-pressed="${l.insightfulByMe}">
        ${icon('lightbulb', l.insightfulByMe ? 'filled' : '')}Insightful <span class="count">${l.insightfulCount || ''}</span></button>
    </footer>
  </article>`;
}

// Card buttons, wired once for every view that shows learning cards.
view.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('.learning');
  const id = card?.dataset.id;
  const action = button.dataset.action;
  if (action === 'photo') return openPhoto(button.dataset.src);
  if (action === 'insightful') {
    const on = button.getAttribute('aria-pressed') !== 'true';
    const countEl = button.querySelector('.count');
    const count = (parseInt(countEl.textContent, 10) || 0) + (on ? 1 : -1);
    button.setAttribute('aria-pressed', on);
    button.classList.toggle('on', on);
    button.querySelector('.icon').classList.toggle('filled', on);
    countEl.textContent = count || '';
    try {
      await api.setInsightful(id, on);
    } catch (err) {
      toast('Could not save that. ' + err.message);
    }
  }
  if (action === 'delete') {
    if (!confirm('Delete this learning? This cannot be undone.')) return;
    try {
      await api.deleteLearning(id);
      card.remove();
      toast('Learning deleted');
    } catch (err) {
      toast('Could not delete. ' + err.message);
    }
  }
});

function openPhoto(src) {
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer';
  dialog.innerHTML = `<img src="${esc(src)}" alt=""><button class="icon-btn close" aria-label="Close">${icon('close')}</button>`;
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

// ---------- post ----------

async function renderPost() {
  setChrome({ title: 'Post', tabs: true, active: 'post' });
  loading();
  const { me } = await loadMembers();
  let photoBlob = null;
  const streak = me.currentStreak;
  const banner = me.postedToday
    ? `You've posted today. Your streak is <b>${streak} ${streak === 1 ? 'day' : 'days'}</b>. Extra learnings are always welcome.`
    : streak
      ? `Posting today keeps your <b>${streak}-day streak</b> alive!`
      : 'Post today to start a new streak.';

  view.innerHTML = `
    <div class="page-head">
      <h1 class="headline-lg teal">Share a learning</h1>
      <a class="icon-btn round" href="#/feed" aria-label="Close">${icon('close')}</a>
    </div>
    <div class="banner">${icon('local_fire_department', 'filled')}<span>${banner}</span></div>
    <div class="card book-card">
      <span class="book-cover">${icon('menu_book')}</span>
      <div class="grow"><p class="label-sm muted">CURRENTLY READING</p>
        <p class="headline-sm clamp">${esc(me.book?.title || 'No book yet')}</p>
        <p class="muted small">${esc(me.book?.author || '')}</p></div>
      <button class="link" id="change-book">Change</button>
    </div>
    <form id="post-form" class="stack" novalidate>
      <div class="card">
        <div class="field-label"><span>Your key takeaway</span><span class="muted small"><span id="count">0</span> / 500</span></div>
        <textarea name="body" maxlength="500" rows="6" class="reading-input" placeholder="What did you learn today?" required></textarea>
      </div>
      <div class="card">
        <label class="field"><span class="field-label">Page / chapter <span class="muted">(optional)</span></span>
          <span class="input-wrap">${icon('bookmark')}<input name="chapter" maxlength="120" placeholder="e.g. Ch. 4, p. 52"></span></label>
      </div>
      <div class="card">
        <div class="field-label"><span>${icon('add_a_photo', 'inline')} Photo of the page or your notes <span class="muted">(optional)</span></span></div>
        <div id="photo-slot"></div>
      </div>
      <p class="form-error" id="post-error" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Share with team ${icon('arrow_forward')}</button>
      <p class="muted small center">Visible to all ${esc(TEAM_NAME)} members in the team feed.</p>
    </form>`;

  const form = document.getElementById('post-form');
  const body = form.elements.body;
  body.addEventListener('input', () => (document.getElementById('count').textContent = body.value.length));
  body.focus();
  document.getElementById('change-book').addEventListener('click', () => openSwitchBook(me, () => renderPost()));

  const slot = document.getElementById('photo-slot');
  const drawPhoto = () => {
    slot.innerHTML = photoBlob
      ? `<div class="photo-preview"><img src="${URL.createObjectURL(photoBlob)}" alt="Selected photo">
          <span class="muted small grow">${Math.round(photoBlob.size / 1024)} KB, ready to share</span>
          <button type="button" class="icon-btn round" id="remove-photo" aria-label="Remove photo">${icon('close')}</button></div>`
      : `<button type="button" class="btn btn-secondary btn-block" id="add-photo">${icon('photo_camera')} Take or choose a photo</button>`;
    slot.querySelector('#add-photo')?.addEventListener('click', async () => {
      const blob = await pickImage(1280);
      if (blob) photoBlob = blob;
      drawPhoto();
    });
    slot.querySelector('#remove-photo')?.addEventListener('click', () => {
      photoBlob = null;
      drawPhoto();
    });
  };
  drawPhoto();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('post-error');
    const text = body.value.trim();
    if (!text) {
      errorEl.textContent = 'Write a line or two about what you learned.';
      errorEl.hidden = false;
      return;
    }
    if (!me.book) {
      errorEl.textContent = 'Pick the book you are reading first (tap Change).';
      errorEl.hidden = false;
      return;
    }
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    button.innerHTML = `${icon('progress_activity', 'spin')} Sharing...`;
    try {
      await api.postLearning({ bookId: me.book.id, body: text, chapter: form.elements.chapter.value.trim(), photoBlob });
      toast(me.postedToday ? 'Shared with the team' : `Shared! Your streak is now ${streak + 1} ${streak + 1 === 1 ? 'day' : 'days'} 🔥`);
      location.hash = '#/feed';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      button.disabled = false;
      button.innerHTML = `Share with team ${icon('arrow_forward')}`;
    }
  });
}

function openSwitchBook(me, onDone) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.innerHTML = `
    <form method="dialog" class="stack" novalidate>
      <div class="page-head"><h2 class="headline-md">Switch book</h2>
        <button class="icon-btn round" value="cancel" aria-label="Close">${icon('close')}</button></div>
      ${me.book ? `<p class="muted small">"${esc(me.book.title)}" will move to your finished books, with all its learnings.</p>` : ''}
      <label class="field"><span class="field-label">New book <em>Required</em></span>
        <span class="input-wrap">${icon('menu_book')}<input name="title" maxlength="200" required></span></label>
      <label class="field"><span class="input-wrap">${icon('stylus_note')}<input name="author" maxlength="120" placeholder="Author (optional)"></span></label>
      <fieldset class="field"><legend class="field-label">Where are you right now? <span class="muted">(optional)</span></legend>${progressPicker('just_started')}</fieldset>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-block" value="save">Save new book</button>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form');
  form.addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'save') return;
    e.preventDefault();
    const title = form.elements.title.value.trim();
    const errorEl = form.querySelector('.form-error');
    if (!title) {
      errorEl.textContent = 'Please add the book title.';
      errorEl.hidden = false;
      return;
    }
    e.submitter.disabled = true;
    try {
      await api.switchBook({ title, author: form.elements.author.value.trim(), progress: form.elements.progress.value || null });
      dialog.close();
      toast('Book updated');
      onDone();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      e.submitter.disabled = false;
    }
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

// ---------- profile ----------

async function renderProfile(memberId) {
  const id = memberId || meId;
  const own = id === meId;
  setChrome({ title: 'Profile', tabs: true, active: own ? 'profile' : '' });
  loading();
  const [{ byId }, learnings] = await Promise.all([loadMembers(), api.listLearningsFor(id)]);
  const member = byId.get(id);
  if (!member) throw new Error('This member could not be found.');

  const currentBookLearnings = learnings.filter((l) => l.book?.id === member.book?.id).length;
  const since = new Date(member.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  view.innerHTML = `
    <section class="card profile-head">
      ${own ? `<button class="avatar-picker small" id="change-avatar" aria-label="Change your photo">${avatar(member, 72)}<span class="avatar-cam">${icon('photo_camera')}</span></button>` : avatar(member, 72)}
      <div><h1 class="headline-lg">${esc(member.name)}</h1><p class="muted small">Reading since ${since}</p></div>
    </section>
    <section class="stat-row">
      <div class="stat amber"><p class="label-sm">CURRENT STREAK ${icon('local_fire_department', 'filled inline')}</p>
        <p class="stat-num">${member.currentStreak} ${member.currentStreak === 1 ? 'day' : 'days'}</p>
        <p class="small">${member.postedToday ? 'Posted today' : member.currentStreak ? 'Post today to keep it' : 'Post to start a streak'}</p></div>
      <div class="stat"><p class="label-sm">BEST RECORD ${icon('emoji_events', 'inline')}</p>
        <p class="stat-num">${member.longestStreak} ${member.longestStreak === 1 ? 'day' : 'days'}</p>
        <p class="small">Personal best</p></div>
    </section>
    <section class="card stack">
      <div class="section-title">${icon('menu_book')}<h2 class="headline-sm">Currently reading</h2>
        ${member.book?.progress ? `<span class="chip teal">${PROGRESS[member.book.progress]}</span>` : ''}</div>
      ${member.book ? `<div class="book-card flat">
        <span class="book-cover">${icon('menu_book')}</span>
        <div class="grow"><p class="headline-sm">${esc(member.book.title)}</p><p class="muted small">${esc(member.book.author || '')}</p>
          <p class="chip small">Started ${timeAgo(member.book.startedAt)} · ${currentBookLearnings} ${currentBookLearnings === 1 ? 'learning' : 'learnings'}</p></div>
      </div>` : `<p class="muted">No book picked yet.</p>`}
      ${own ? `<button class="btn btn-secondary btn-block" id="switch-book">${icon('done_all')} Finished / switch book</button>` : ''}
    </section>
    <section class="card stack">${calendar(learnings, member)}</section>
    <section class="stack">
      <div class="section-title">${icon('history_edu')}<h2 class="headline-sm">${own ? 'Your past learnings' : 'Past learnings'}</h2>
        <span class="muted small">${learnings.length} ${learnings.length === 1 ? 'entry' : 'entries'}</span></div>
      ${groupedLearnings(learnings, member)}
    </section>
    ${own && api.isDemo ? `<button class="btn btn-ghost btn-block" id="reset-demo">Reset demo data</button>` : ''}`;

  document.getElementById('switch-book')?.addEventListener('click', () => openSwitchBook(member, () => renderProfile(memberId)));
  document.getElementById('change-avatar')?.addEventListener('click', async () => {
    const blob = await pickImage(400);
    if (!blob) return;
    try {
      await api.updateAvatar(blob);
      toast('Photo updated');
      renderProfile(memberId);
    } catch (err) {
      toast('Could not update photo. ' + err.message);
    }
  });
  document.getElementById('reset-demo')?.addEventListener('click', () => {
    api.resetDemo();
    location.hash = '#/welcome';
    location.reload();
  });
}

// Last four weeks, Monday to Sunday, ending with the current week.
function calendar(learnings, member) {
  const today = todayIst();
  const joined = todayIst(new Date(member.createdAt));
  const posted = new Set(learnings.map((l) => l.postedOn));
  const weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -weekday - 21);
  let active = 0;
  let elapsed = 0;
  const cells = [];
  for (let i = 0; i < 28; i++) {
    const day = addDays(start, i);
    const future = day > today;
    const did = posted.has(day);
    if (!future && day >= joined) elapsed++;
    if (did) active++;
    const cls = future ? 'future' : day === today ? (did ? 'today did' : 'today') : did ? 'did' : '';
    cells.push(`<span class="cal-cell ${cls}" title="${day}${did ? ': posted' : ''}"></span>`);
  }
  return `
    <div class="section-title">${icon('calendar_month')}<h2 class="headline-sm">Streak and consistency</h2>
      <span class="chip teal">${active}/${elapsed} days</span></div>
    <div class="cal">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="cal-head">${d}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="cal-legend"><span><i class="cal-cell"></i>Rest</span><span><i class="cal-cell did"></i>Posted</span><span><i class="cal-cell today"></i>Today</span></div>`;
}

function groupedLearnings(learnings, member) {
  if (!learnings.length) return `<div class="empty card"><p class="muted">No learnings yet.</p></div>`;
  const groups = new Map();
  for (const l of learnings) {
    const key = l.book?.id || 'none';
    if (!groups.has(key)) groups.set(key, { book: l.book, items: [] });
    groups.get(key).items.push(l);
  }
  return [...groups.values()]
    .map(({ book, items }) => {
      const current = book?.id === member.book?.id;
      return `<div class="card stack book-group">
        <div class="group-head"><div>
          <p class="label-sm ${current ? 'teal' : 'muted'}">${current ? 'CURRENTLY READING' : `FINISHED ${icon('check_circle', 'inline')}`}</p>
          <p class="headline-sm">${esc(book?.title || 'Unknown book')}</p>${book?.author ? `<p class="muted small">by ${esc(book.author)}</p>` : ''}</div>
          <span class="chip teal">${items.length} ${items.length === 1 ? 'note' : 'notes'}</span></div>
        ${items.map((l) => learningCard(l, member, { showAuthor: false })).join('')}
      </div>`;
    })
    .join('');
}

// ---------- start ----------

async function start() {
  try {
    api = await createApi();
    meId = await api.currentUserId();
  } catch (err) {
    topbar.hidden = true;
    return showError(err);
  }
  window.addEventListener('hashchange', route);
  route();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

start();
