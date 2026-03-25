# Bus Lisbon

Real-time bus tracking PWA for **Carris Metropolitana** (Lisbon metropolitan area). View live bus positions, stop arrivals, route shapes, and past passages — all from your phone.

## Features

- **Live Map** — Bus positions updated every 5s on a dark/light Leaflet map with marker clustering
- **Stop Details** — Tap any stop to see real-time ETAs with punctuality indicators (on time, delayed, early)
- **Past Arrivals** — See which buses already passed, with actual vs scheduled times
- **Route Shapes** — Tap an arrival to see the full route drawn on the map with the bus position
- **Search** — Find any stop by name or ID
- **Favorites** — Save frequently used stops for quick access
- **Splash Screen** — Animated loading screen with logo and pulsing indicators
- **PWA** — Install on iPhone/Android as a native-feeling app with offline support
- **iOS Optimized** — Safe area insets, swipe gestures, pull-to-expand panel

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS 3 |
| Map | Leaflet + react-leaflet |
| Data Fetching | SWR (stale-while-revalidate) |
| Icons | lucide-react |
| API | [Carris Metropolitana Public API](https://api.carrismetropolitana.pt) |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build
```

## Project Structure

```
src/
  components/
    TrackingMap.tsx      # Main Leaflet map with stops, buses, routes
    StopDetailsPanel.tsx # Bottom panel with ETAs + past arrivals
    SearchBar.tsx        # Stop search overlay
    BusMarker.tsx        # Animated bus icon on map
    SplashScreen.tsx     # Loading screen
  services/
    api.ts              # Carris API hooks (SWR)
    history.ts          # Arrival deviation tracking
  hooks/
    useFavorites.ts     # Favorite stops (localStorage)
  App.tsx               # Root layout + splash logic
  index.css             # Global styles + animations
```

## API

Uses the public [Carris Metropolitana API](https://api.carrismetropolitana.pt):

- `GET /stops` — All stops (cached 1h)
- `GET /stops/:id/realtime` — Live ETAs + past arrivals for a stop
- `GET /v2/vehicles` — All vehicle positions
- `GET /patterns/:id` — Route pattern (shape reference)
- `GET /shapes/:id` — Route geometry (GeoJSON)

## License

MIT
