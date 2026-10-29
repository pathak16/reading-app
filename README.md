# Reading App

A lightweight team reading app. Each member logs the book they're reading and posts one learning a day, with an optional photo. Everyone's posts show up in a shared team feed, and posting every day builds a streak.

- **No login:** members enter their name, the book they're reading, and an optional photo once. The app then remembers them on that device using a Supabase anonymous sign-in.
- **Streaks:** a day counts when you post at least one learning that day, using India Standard Time. The streak stays alive until midnight, and a missed day resets it to 0. The rules live in the `member_stats` view in `supabase/schema.sql`.
- **Photos** are compressed in the browser to about 100–250 KB before upload.
- **Installable:** the app works as a Progressive Web App, so members can add it to their home screen from the browser menu.
- **No build step:** the app is plain HTML, CSS and JavaScript modules, hosted for free as static files.

## Try it locally (demo mode)

With empty keys in `js/config.js`, the app runs on sample data saved in your browser.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Go live (about 10 minutes, free)

1. **Create a Supabase project:** go to https://supabase.com, choose New project, and pick the Mumbai region.
2. **Create the tables:** open SQL Editor > New query, paste all of `supabase/schema.sql`, and click Run.
3. **Allow no-password sign-in:** go to Authentication > Sign In / Providers and turn on **Allow anonymous sign-ins**.
4. **Add your keys:** in Project Settings > API, copy the Project URL and the `anon` public key into `js/config.js`. Set `TEAM_NAME` to your team's name, then commit.
5. **Deploy on Vercel:** go to https://vercel.com, choose Add New > Project, and import this repository. Leave the framework preset as "Other", with no build command, then click Deploy.
6. **Share the link:** send the Vercel URL to the team. On a phone, open it and choose "Add to Home Screen".

## Good to know

- Anyone who has the link can join. Share it only inside the team.
- Each person's identity is stored in their browser. If they clear site data or switch phones, they rejoin as a new member and start a new streak.
- Supabase pauses free projects after 7 days with no activity. Daily posting keeps the project awake. If it does pause, click Restore in the dashboard.
- The free tier includes 500 MB of database and 1 GB of file storage. That is roughly a year of daily photos from 15 people.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | App shell |
| `css/styles.css` | Styles, using the design tokens from the Stitch mockups |
| `js/app.js` | Screens: welcome, join, feed, post, profile |
| `js/api.js` | Data layer: Supabase, or a demo store when no keys are set |
| `js/image.js` | In-browser photo compression |
| `js/config.js` | Supabase keys and team name |
| `supabase/schema.sql` | Tables, streak view, security rules and storage buckets |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app (PWA) |
