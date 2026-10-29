// Data layer. The views only talk to the object returned by createApi(), which is backed
// by Supabase when js/config.js has keys, or by a local demo store when it does not.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export async function createApi() {
  return isDemo ? createDemoApi() : createSupabaseApi();
}

// ---------- shared helpers ----------

const istFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

// Today's date in India Standard Time, as YYYY-MM-DD (matches today_ist() in the database).
export function todayIst(date = new Date()) {
  return istFormat.format(date);
}

export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Same rules as the member_stats view in supabase/schema.sql.
export function streakStats(days, today = todayIst()) {
  const sorted = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  let current = 0;
  for (const day of sorted) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  if (prev && prev >= addDays(today, -1)) current = run;
  return { currentStreak: current, longestStreak: longest, postedToday: prev === today };
}

// ---------- Supabase ----------

async function createSupabaseApi() {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const publicUrl = (bucket, path) =>
    path ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;

  let userId = null;

  async function upload(bucket, blob) {
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    check(await sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' }));
    return path;
  }

  async function listMembers() {
    const [profiles, stats, books] = await Promise.all([
      sb.from('profiles').select('id, name, avatar_path, created_at').then(check),
      sb.from('member_stats').select('*').then(check),
      sb.from('books').select('id, user_id, title, author, progress, started_at').eq('status', 'reading').then(check),
    ]);
    const statsById = new Map(stats.map((s) => [s.user_id, s]));
    const bookById = new Map(books.map((b) => [b.user_id, b]));
    return profiles.map((p) => {
      const s = statsById.get(p.id) || {};
      const b = bookById.get(p.id);
      return {
        id: p.id,
        name: p.name,
        avatarUrl: publicUrl('avatars', p.avatar_path),
        createdAt: p.created_at,
        currentStreak: s.current_streak || 0,
        longestStreak: s.longest_streak || 0,
        postedToday: !!s.posted_today,
        book: b ? { id: b.id, title: b.title, author: b.author, progress: b.progress, startedAt: b.started_at } : null,
      };
    });
  }

  const LEARNING_FIELDS =
    'id, user_id, body, chapter, photo_path, posted_on, created_at, books(id, title, author, status, finished_at), reactions(user_id)';

  function toLearning(row) {
    return {
      id: row.id,
      userId: row.user_id,
      body: row.body,
      chapter: row.chapter,
      photoUrl: publicUrl('photos', row.photo_path),
      postedOn: row.posted_on,
      createdAt: row.created_at,
      book: row.books,
      insightfulCount: row.reactions.length,
      insightfulByMe: row.reactions.some((r) => r.user_id === userId),
    };
  }

  return {
    isDemo: false,

    async currentUserId() {
      const { data } = await sb.auth.getSession();
      userId = data.session?.user.id || null;
      if (!userId) return null;
      const profile = check(await sb.from('profiles').select('id').eq('id', userId).maybeSingle());
      return profile ? userId : null;
    },

    async join({ name, bookTitle, bookAuthor, progress, avatarBlob }) {
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        const res = check(await sb.auth.signInAnonymously());
        userId = res.user.id;
      } else {
        userId = data.session.user.id;
      }
      const avatarPath = avatarBlob ? await upload('avatars', avatarBlob) : null;
      check(await sb.from('profiles').insert({ id: userId, name, avatar_path: avatarPath }));
      check(await sb.from('books').insert({ user_id: userId, title: bookTitle, author: bookAuthor || null, progress }));
      return userId;
    },

    listMembers,

    async listFeed() {
      const rows = check(
        await sb.from('learnings').select(LEARNING_FIELDS).order('created_at', { ascending: false }).limit(100)
      );
      return rows.map(toLearning);
    },

    async listLearningsFor(memberId) {
      const rows = check(
        await sb.from('learnings').select(LEARNING_FIELDS).eq('user_id', memberId).order('created_at', { ascending: false })
      );
      return rows.map(toLearning);
    },

    async postLearning({ bookId, body, chapter, photoBlob }) {
      const photoPath = photoBlob ? await upload('photos', photoBlob) : null;
      check(await sb.from('learnings').insert({ user_id: userId, book_id: bookId, body, chapter: chapter || null, photo_path: photoPath }));
    },

    async setInsightful(learningId, on) {
      if (on) check(await sb.from('reactions').insert({ learning_id: learningId, user_id: userId }));
      else check(await sb.from('reactions').delete().match({ learning_id: learningId, user_id: userId }));
    },

    async deleteLearning(learningId) {
      check(await sb.from('learnings').delete().eq('id', learningId));
    },

    async switchBook({ title, author, progress }) {
      check(
        await sb.from('books').update({ status: 'finished', finished_at: new Date().toISOString() })
          .match({ user_id: userId, status: 'reading' })
      );
      check(await sb.from('books').insert({ user_id: userId, title, author: author || null, progress }));
    },

    async updateAvatar(blob) {
      const path = await upload('avatars', blob);
      check(await sb.from('profiles').update({ avatar_path: path }).eq('id', userId));
    },
  };
}

// ---------- Demo store (localStorage) ----------

const DEMO_KEY = 'reading-app-demo-v1';

function seedDemo() {
  const today = todayIst();
  const ago = (days, hours = 9) => {
    const d = new Date(addDays(today, -days) + 'T00:00:00+05:30');
    d.setHours(d.getHours() + hours);
    return d.toISOString();
  };
  const people = [
    ['p1', 'Elena Rostova', 'Atomic Habits', 'James Clear', 12],
    ['p2', 'Marcus Chen', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 5],
    ['p3', 'Sofia Al-Mansoor', 'Show Your Work!', 'Austin Kleon', 7],
    ['p4', 'David K.', 'Klara and the Sun', 'Kazuo Ishiguro', 3],
  ];
  const notes = {
    p1: ['You do not rise to the level of your goals. You fall to the level of your systems.',
         'Habit stacking: pair a new habit with something you already do every day.'],
    p2: ['Reliability means continuing to work correctly even when things go wrong.',
         'Choose boring technology for the core and spend innovation tokens carefully.'],
    p3: ["Don't hoard your work-in-progress drafts. Sharing early invites feedback faster than polishing in a silo."],
    p4: ['Ishiguro explores empathy through synthetic eyes. It makes you reflect on what we know about the people we care for.'],
  };
  const state = { meId: null, profiles: [], books: [], learnings: [], reactions: [] };
  for (const [id, name, title, author, streak] of people) {
    state.profiles.push({ id, name, avatarUrl: null, createdAt: ago(40) });
    state.books.push({ id: 'b' + id, userId: id, title, author, progress: 'midway', status: 'reading', startedAt: ago(20), finishedAt: null });
    const lines = notes[id];
    for (let d = 0; d < streak; d++) {
      // Everyone except David has posted today.
      if (id === 'p4' && d === 0) continue;
      state.learnings.push({
        id: `${id}-${d}`, userId: id, bookId: 'b' + id, body: lines[d % lines.length], chapter: d === 0 ? 'Ch. 3' : null,
        photoUrl: null, postedOn: addDays(today, -d), createdAt: ago(d, 8 + (id.charCodeAt(1) % 5)),
      });
    }
  }
  state.reactions.push({ learningId: 'p1-0', userId: 'p2' }, { learningId: 'p1-0', userId: 'p3' }, { learningId: 'p3-0', userId: 'p1' });
  return state;
}

function createDemoApi() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(DEMO_KEY)) || seedDemo();
  } catch {
    state = seedDemo();
  }
  const save = () => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keep working in memory for this visit.
    }
  };
  const blobToDataUrl = (blob) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  const newId = () => Math.random().toString(36).slice(2, 10);

  function toLearning(l) {
    const reactions = state.reactions.filter((r) => r.learningId === l.id);
    const book = state.books.find((b) => b.id === l.bookId);
    return {
      id: l.id, userId: l.userId, body: l.body, chapter: l.chapter, photoUrl: l.photoUrl,
      postedOn: l.postedOn, createdAt: l.createdAt,
      book: book && { id: book.id, title: book.title, author: book.author, status: book.status, finished_at: book.finishedAt },
      insightfulCount: reactions.length,
      insightfulByMe: reactions.some((r) => r.userId === state.meId),
    };
  }
  const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

  return {
    isDemo: true,

    async currentUserId() {
      return state.meId;
    },

    async join({ name, bookTitle, bookAuthor, progress, avatarBlob }) {
      const id = 'me-' + newId();
      state.meId = id;
      state.profiles.push({ id, name, avatarUrl: avatarBlob ? await blobToDataUrl(avatarBlob) : null, createdAt: new Date().toISOString() });
      state.books.push({ id: 'b' + id, userId: id, title: bookTitle, author: bookAuthor || null, progress, status: 'reading', startedAt: new Date().toISOString(), finishedAt: null });
      save();
      return id;
    },

    async listMembers() {
      const today = todayIst();
      return state.profiles.map((p) => {
        const days = state.learnings.filter((l) => l.userId === p.id).map((l) => l.postedOn);
        const b = state.books.find((x) => x.userId === p.id && x.status === 'reading');
        return {
          ...p,
          ...streakStats(days, today),
          book: b ? { id: b.id, title: b.title, author: b.author, progress: b.progress, startedAt: b.startedAt } : null,
        };
      });
    },

    async listFeed() {
      return state.learnings.slice().sort(byNewest).slice(0, 100).map(toLearning);
    },

    async listLearningsFor(memberId) {
      return state.learnings.filter((l) => l.userId === memberId).sort(byNewest).map(toLearning);
    },

    async postLearning({ bookId, body, chapter, photoBlob }) {
      state.learnings.push({
        id: newId(), userId: state.meId, bookId, body, chapter: chapter || null,
        photoUrl: photoBlob ? await blobToDataUrl(photoBlob) : null,
        postedOn: todayIst(), createdAt: new Date().toISOString(),
      });
      save();
    },

    async setInsightful(learningId, on) {
      state.reactions = state.reactions.filter((r) => !(r.learningId === learningId && r.userId === state.meId));
      if (on) state.reactions.push({ learningId, userId: state.meId });
      save();
    },

    async deleteLearning(learningId) {
      state.learnings = state.learnings.filter((l) => !(l.id === learningId && l.userId === state.meId));
      save();
    },

    async switchBook({ title, author, progress }) {
      for (const b of state.books) {
        if (b.userId === state.meId && b.status === 'reading') {
          b.status = 'finished';
          b.finishedAt = new Date().toISOString();
        }
      }
      state.books.push({ id: newId(), userId: state.meId, title, author: author || null, progress, status: 'reading', startedAt: new Date().toISOString(), finishedAt: null });
      save();
    },

    async updateAvatar(blob) {
      const me = state.profiles.find((p) => p.id === state.meId);
      me.avatarUrl = await blobToDataUrl(blob);
      save();
    },

    resetDemo() {
      try {
        localStorage.removeItem(DEMO_KEY);
      } catch {
        // ignore
      }
    },
  };
}
