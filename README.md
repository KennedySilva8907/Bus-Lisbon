# Bus Lisbon

> Real-time bus tracker for **Carris Metropolitana** (Lisbon area), built as a
> Progressive Web App. It shows live bus positions on a Leaflet map, arrival
> times for each stop, and web-push arrival alerts. No account, no SMS, no cost.

**Live demo:** https://buslisbon.vercel.app

---

## Why I built this

The official Carris Metropolitana website and app, which most people use to
check their buses, were often down or would not load when my friends and I
tried to use them. I noticed that even when the site was down, the public API
was still working and returning live data. So I went ahead and started building
my own app on top of that API, to get a reliable real-time view of the buses.

It started simple: just showing the live bus positions on a map. Over time I
kept adding new features as I went, like arrival times for each stop, arrival
alerts, offline support, and a more app-like experience on mobile.

---

## Features

**Map and live data**
- Live Carris feed, refreshed every few seconds, with caching so it does not
  reload data it already has
- Dark and light map themes
- Stop dots stay small on screen but are still easy to tap
- The selected bus is followed on the map, with the route line drawn on top
- Stop search across all of the roughly 12,000 Carris stops

**Arrival times (ETAs)**
- The countdown updates smoothly every few seconds instead of jumping
- The minutes left always match the exact arrival time shown next to it
- Shows "Agora" or "<1min" in the final minute
- A "stale data" badge appears when the live feed has not refreshed recently
  (iOS pauses timers while the app is in the background)

**Arrival alerts (no account needed)**
- Tap a bell on a future arrival, pick how early you want to be warned
  (3, 5, 10, 15 minutes or a custom value), and get a push notification when
  the bus is that close
- No sign-up: the push subscription itself identifies the device
- You cannot set an alert that is already too late for the current arrival
- Tapping the notification opens the app on the right stop, with the route
  already drawn

**iOS and mobile polish**
- Full-screen layout that handles the iPhone safe areas correctly
- The map re-checks its size on rotation, resize, and when you come back to
  the app, to avoid blank map tiles
- Floating controls with a frosted look and a yellow accent

**Offline and install**
- The app caches stops and map tiles so it can still open offline
- It can be added to the home screen and behaves like a native app

---

## How it works (architecture)

```
+--------------------+         +--------------------+
|  Browser / iOS PWA |         | Carris Metropolit. |
|  React + Vite      | <-------|      Public API    |
|  Tailwind + SWR    |  poll   |                    |
|  Service Worker    |         +--------------------+
|                    |
|   PushManager      |
+---------+----------+
          |  subscribe / list / cancel
          v
+-----------------------------------------------------+
| Vercel Functions (Node)                             |
|   /api/alerts        POST / GET                     |
|   /api/alerts/[id]   DELETE (owner-checked)         |
|   /api/cron-check-alerts                            |
|      called every minute by cron-job.org            |
|      polls Carris realtime, sends web-push          |
+---------------------+-------------------------------+
                      |
                      v
              +--------------+        +--------------------+
              | Upstash      |        | web-push           |
              | Redis (KV)   |        | (browser push)     |
              | free tier    |        |                    |
              +--------------+        +--------------------+
                                              |
                                              v
                                      Notification on
                                      the user's device
```

Why it is built this way:
- **No user accounts.** The push subscription works as the device ID, so there
  is no login and no extra personal data to store.
- **External cron.** A free service (cron-job.org) triggers the alert check
  every minute, because the free Vercel plan only allows a daily cron.
- **Upstash Redis** is used for storage because its free plan is enough for
  this project.
- **Stateless function.** Each run of the alert check loads the pending alerts,
  checks Carris, sends any due notifications, and updates storage in one pass.

---

## Some tricky parts the app handles

- **Carris returns every arrival of the day for a stop, including past ones.**
  The alert check has to skip the arrivals that already happened and use the
  next future one. Otherwise it would think the bus passed hours ago and cancel
  the alert immediately.
- **The alert check runs once a minute,** so it catches the bus somewhere
  inside a 60 second window. The notification shows the threshold you picked,
  so the number matches what you expect.
- **iOS pauses timers** when the app is in the background, so the data can be a
  little old. The app re-syncs when you come back and shows how old the data is.
- **iPhone full-height CSS quirk.** The usual full-height unit left a dark strip
  at the bottom on iPhone, so the layout combines units to cover the whole
  screen.
- **Tapping small dots.** Stop dots are small for a clean look but use a click
  tolerance so they are still easy to tap, even when a route line passes over
  them.

---

## Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | React + TypeScript | |
| Build | Vite | |
| Styling | Tailwind CSS | Custom Carris colour palette |
| Map | Leaflet + react-leaflet | Canvas renderer for the stop layer |
| Data fetching | SWR | Caching and refresh on focus |
| Backend | Vercel Functions (Node) | Free tier |
| Database | Upstash Redis | Free tier |
| Push | web-push library with VAPID | No third-party service |
| Cron | cron-job.org | Free, runs every minute |
| Icons | lucide-react | |
| API | api.carrismetropolitana.pt | Public, no key needed |

---

## Project structure

```
api/                       # Vercel Functions
  _lib/
    kv.ts                  # Redis client (Upstash)
    types.ts               # Alert / subscription shapes + storage keys
  alerts/
    index.ts               # POST /api/alerts   GET /api/alerts
    [id].ts                # DELETE /api/alerts/:id (owner check)
  cron-check-alerts.ts     # Cron worker: polls Carris, sends web-push
  debug-alerts.ts          # Diagnostic dump (token protected)

public/
  sw.js                    # Service worker: cache + push + notification click

src/
  components/
    TrackingMap.tsx        # Leaflet map, layers, buttons
    StopDetailsPanel.tsx   # Bottom panel: arrival times, bells
    AlertSetupModal.tsx    # Threshold picker
    AlertsPanel.tsx        # Pending alerts list + cancel
    NotificationBell.tsx   # Reusable bell button
    SearchBar.tsx          # Stop search
    BusMarker.tsx          # Animated bus icon
    SplashScreen.tsx
  services/
    api.ts                 # Carris API hooks (SWR)
    push.ts                # Alerts API client
    history.ts             # Local arrival tracking
  hooks/
    useAlerts.ts           # Alerts store
    useFavorites.ts        # Favourites in localStorage
  App.tsx                  # Layout, splash, notification handling
  index.css                # Global styles
```

---

## Getting started

```bash
git clone https://github.com/KennedySilva8907/Bus-Lisbon.git
cd Bus-Lisbon
npm install
npm run dev          # http://localhost:5173
```

For the full setup of the push notifications backend (VAPID keys, Upstash,
environment variables, external cron), see
[`docs/PUSH_NOTIFICATIONS_SETUP.md`](docs/PUSH_NOTIFICATIONS_SETUP.md).

---

## What I would build next

- A reliability score per line or stop, using the arrival data the app already
  tracks
- Line-level alerts ("any 758 here") instead of alerts tied to one specific bus
- Automated end-to-end tests
- Optional accounts, so alerts can follow you across devices

---

## License

[MIT](LICENSE) 2026 Kennedy Silva ([KennedySilva8907](https://github.com/KennedySilva8907))
