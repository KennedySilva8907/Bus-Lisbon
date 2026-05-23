# Bus Lisbon

> Real-time bus tracker for **Carris Metropolitana** (Lisbon area), built as a
> Progressive Web App. Live positions on a Leaflet map, per-stop ETAs that
> stay aligned with the wall clock, and **web-push arrival alerts** that
> behave like native iOS notifications — no account, no SMS, no cost.

**Live demo:** https://buslisbon.vercel.app

---

## Why I built this

Carris Metropolitana publishes a clean public API but no first-party real-time
app for casual riders. The existing apps either bury the data behind heavy UI
or stop short of features people actually want — like *"ping me when the bus
is 10 minutes out."*

I wanted a project that pushed me past the "fetch + render a list"
boilerplate into the messier territory of:

- **Mobile-first realities** (iOS PWA quirks, safe areas, background timers)
- **Production push notifications** without a paid notification service
- **Edge serverless** with cron-driven side effects
- **Time-domain UX** — small details like keeping a 10-min countdown
  visually consistent with the absolute arrival time below it

---

## Feature highlights

**Map & live data**
- Carris realtime feed polled every 5–8 s via SWR, with cache, dedup, and
  focus/reconnect revalidation
- Dark and light Leaflet themes (Carto + Google tile providers)
- Custom canvas renderer with tap-tolerance so stop dots stay small visually
  but reach Apple's 44 pt touch target
- Selected vehicle is followed on the map; the route polyline draws on top
  with directional arrows
- Stop search with debounced filtering across the full ~12 k Carris stops

**ETA accuracy**
- Countdown ticks every 5 s independently of the SWR refresh, so labels
  drop smoothly instead of jumping
- Minute math uses *clock-minute subtraction* (`HH:mm − HH:mm`) so the
  rounded countdown always matches the absolute time shown beside it
- "Agora" / "<1min" bands cover the last 60 s of honesty
- A "stale data" badge appears when the realtime feed hasn't refreshed in
  the last 30 s (iOS pauses background timers during PWA suspension)

**Web-push arrival alerts (no account required)**
- Tap a bell on a future arrival → choose a threshold (3 / 5 / 10 / 15 min
  or custom) → receive a push when the bus is that close
- The `PushSubscription` endpoint *is* the identity; users never sign up
- Threshold options are validated against the current ETA so you can't
  schedule an unreachable alert
- Notifications deep-link back into the app with the right stop selected
  and the route polyline already drawn
- Service worker broadcasts an `alert-fired` message to open tabs so the
  bell badge clears in real time

**iOS PWA polish**
- Edge-to-edge layout using `100lvh` so the home indicator area paints
  correctly (`100dvh` silently excludes it on iPhone)
- Every overlay applies `env(safe-area-inset-*)` internally — the body is
  full-bleed, the controls aren't
- `MapSizeWatcher` calls `invalidateSize()` across multiple ticks at
  mount, plus on `resize`, `orientationchange`, `visibilitychange`,
  `pageshow`, and panel transitions — kills the "blank tiles after cold
  start / notification tap / splash fade" class of bugs
- Frosted-dark floating controls with a yellow accent ring on hover

**Offline & install**
- Service worker pre-caches stops + map tiles for offline boot
- Add-to-home-screen onboarding when push is requested on Safari
- Native app feel via PWA manifest (`standalone`, themed status bar,
  splash colors)

---

## Architecture

```
┌────────────────────┐         ┌────────────────────┐
│  Browser / iOS PWA │         │ Carris Metropolit. │
│  React 19 + Vite   │◄────────┤      Public API    │
│  Tailwind + SWR    │  poll   │                    │
│  Service Worker    │         └────────────────────┘
│                    │
│   PushManager      │
└────────┬───────────┘
         │ subscribe / list / cancel
         ▼
┌─────────────────────────────────────────────────────┐
│ Vercel Functions (Node)                             │
│  ├ /api/alerts       POST / GET                     │
│  ├ /api/alerts/[id]  DELETE  (owner-checked)        │
│  └ /api/cron-check-alerts                           │
│     ↳ called every minute by cron-job.org           │
│     ↳ polls Carris realtime, sends web-push         │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
              ┌──────────────┐        ┌────────────────────┐
              │ Upstash      │        │ FCM / APNs / WNS   │
              │ Redis (KV)   │        │ (web-push)         │
              │ free tier    │        │                    │
              └──────────────┘        └────────────────────┘
                                              │
                                              ▼
                                      Notification on
                                      the user's device
```

Why this shape:
- **No user accounts** — push subscription endpoints double as device IDs,
  which removes auth, GDPR overhead, and a whole UI surface
- **External cron** (cron-job.org) because Vercel Hobby caps cron to
  daily; a free external service runs the once-per-minute job and posts
  to `/api/cron-check-alerts` with a bearer token
- **Upstash over Vercel KV** — Vercel deprecated the free KV tier;
  Upstash's free plan covers 10 k commands/day, which is plenty here
- **Stateless functions** — every cron tick is idempotent: it loads
  pending alerts, filters Carris arrivals, sends pushes, and updates KV
  in one pass

---

## Engineering challenges worth flagging

- **Carris realtime returns *every passage of the day* for a stop, past
  ones included.** The cron initially matched `vehicle_id` to the first
  occurrence and saw `minutesAway = -817` (yesterday morning's run),
  expiring every alert instantly. The fix filters out observed-arrival
  entries and picks the next future passage.
- **Cron interval vs. user threshold.** A once-per-minute cron always
  catches the bus *somewhere in a 60 s window*, so the alert fires
  between `threshold` and `threshold + 1` minutes away. The notification
  body shows the user's chosen threshold (`min(threshold, round(actual))`)
  so the displayed number matches expectations and is only lower when we
  legitimately fire late.
- **iOS Safari pauses background timers** while the PWA is suspended,
  including the SWR `refreshInterval` and any `setInterval`. The app
  resyncs on `visibilitychange` and tracks a "data is N seconds old"
  badge so users know when the prediction was last updated.
- **iOS `100dvh` quirk.** On iPhone PWA standalone, `100dvh` excludes
  the home indicator's safe area, leaving an ~80 px dark strip at the
  bottom. Pinning the chain to `100vh + 100lvh` covers the full screen.
- **Click reliability over a custom canvas.** Stop dots are drawn small
  for visual density but receive a `tolerance: 12` canvas renderer and
  `bubblingMouseEvents: false` so taps register reliably even when a
  polyline passes through.

---

## Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | React 19 + TypeScript | Concurrent rendering, strict mode |
| Build | Vite 7 | Fast dev + first-class TS |
| Styling | Tailwind CSS 3 | Custom Carris colour palette |
| Map | Leaflet + react-leaflet | Canvas renderer for stop layer |
| Data | SWR | revalidate-on-focus, dedup, keepPreviousData |
| Backend | Vercel Functions (Node) | Edge-friendly, free tier |
| Database | Upstash Redis | 10 k commands/day free |
| Push | `web-push` lib + VAPID | No third-party service |
| Cron | cron-job.org | Free 1-minute cadence |
| Icons | lucide-react | |
| API | [api.carrismetropolitana.pt](https://api.carrismetropolitana.pt) | Public, no key needed |

---

## Project structure

```
api/                       # Vercel Functions
  _lib/
    kv.ts                  # Shared Redis client (Upstash + KV legacy fallback)
    types.ts               # Alert / SubscriptionPayload shapes + KV keys
  alerts/
    index.ts               # POST  /api/alerts   GET  /api/alerts
    [id].ts                # DELETE /api/alerts/:id (owner check)
  cron-check-alerts.ts     # Cron worker: polls Carris, fires web-push
  debug-alerts.ts          # Diagnostic dump, bearer-token gated

public/
  sw.js                    # SW: tile/stop cache + push + notificationclick

src/
  components/
    TrackingMap.tsx        # Leaflet map, layers, button cluster
    StopDetailsPanel.tsx   # Bottom panel: ETAs, past arrivals, bells
    AlertSetupModal.tsx    # Threshold picker with current-ETA validation
    AlertsPanel.tsx        # Bell + pending list + cancel
    NotificationBell.tsx   # Reusable bell affordance
    SearchBar.tsx          # Stop search overlay
    BusMarker.tsx          # Smooth-animated bus icon
    SplashScreen.tsx
  services/
    api.ts                 # Carris API hooks (SWR)
    push.ts                # VAPID + alerts API client
    history.ts             # Local arrival-deviation tracking
  hooks/
    useAlerts.ts           # Module-level singleton store for alerts
    useFavorites.ts        # Favourites in localStorage
  App.tsx                  # Layout, splash, notification deep-link
  index.css                # Global styles + obsidian-glass primitives
```

---

## Getting started

```bash
git clone https://github.com/KennedySilva8907/Bus-Lisbon.git
cd Bus-Lisbon
npm install
npm run dev          # http://localhost:5173
```

For full setup of the push notifications backend (VAPID keys, Upstash, env
vars, external cron), see [`docs/PUSH_NOTIFICATIONS_SETUP.md`](docs/PUSH_NOTIFICATIONS_SETUP.md).

---

## What I'd build next

- **Reliability heatmap** — Carris arrival deviations are already tracked
  client-side in `history.ts`; aggregating them into a per-line / per-stop
  reliability score is a natural next surface
- **"Any 758 here" alerts** — currently alerts pin to a specific
  `vehicle_id`; supporting line-level alerts at a stop would smooth over
  cases where a bus drops from the feed before reaching the threshold
- **End-to-end tests** with Playwright against a mocked Carris fixture
- **Multi-device sync** behind an optional account, for users who want
  alerts to follow them across devices

---

## License

[MIT](LICENSE) © 2026 Kennedy Silva ([KennedySilva8907](https://github.com/KennedySilva8907))
