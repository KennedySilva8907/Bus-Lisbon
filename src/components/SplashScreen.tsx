import { useEffect, useState } from 'react';

interface SplashScreenProps {
  fading: boolean;
}

/**
 * Splash screen — "Edge" layout.
 *
 * Phone: the portrait artwork fills the screen edge-to-edge. A gradient lifts
 * the bottom into pure black where the wordmark, coordinates, and progress
 * bar sit.
 *
 * Screens wider than they are tall get the landscape artwork instead, and the
 * title stack is held to a column on the left so it does not stretch across
 * a wide monitor. The choice follows the shape of the viewport, not its
 * width: a tablet held upright keeps the portrait artwork.
 *
 * Progress eases toward 92 % via a 1 − e^(−t/τ) curve while the app boots,
 * then snaps to 100 % the moment the parent triggers the fade — the user
 * sees a confident "done", not "cancelled mid-load".
 */
export default function SplashScreen({ fading }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (fading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(100);
      return;
    }
    const start = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const eased = 1 - Math.exp(-elapsed / 1.6);
      setProgress(Math.min(92, Math.round(eased * 92)));
    };
    tick();
    const interval = setInterval(tick, 90);
    return () => clearInterval(interval);
  }, [fading]);

  return (
    <div
      role="status"
      aria-label="A carregar Bus Lisbon"
      aria-hidden={fading}
      className={`fixed inset-0 z-[9999] overflow-hidden flex items-stretch justify-center transition-opacity duration-500 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#FFCC00' }}
    >
      <div className="relative w-full h-full overflow-hidden">
        <picture>
          <source media="(min-aspect-ratio: 1/1)" srcSet="/splash-wide.jpg" />
          <img
            src="/splash-hero.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover object-[center_30%] landscape:object-center"
            loading="eager"
            decoding="sync"
          />
        </picture>

        {/* Gradient lifts the lower band into black for legibility */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: '38%',
            background:
              'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.78) 70%, #000 100%)',
          }}
        />

        {/* On a wide screen the artwork is bright where the title sits, so the
          * left edge is darkened as well. */}
        <div
          aria-hidden="true"
          className="hidden landscape:block absolute inset-y-0 left-0 w-2/3 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 45%, transparent 100%)',
          }}
        />

        {/* Title stack */}
        <div
          className="absolute left-0 right-0 px-5 sm:px-7 md:px-14 landscape:max-w-2xl"
          style={{ bottom: 'max(28px, env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div
            className="text-white uppercase font-black"
            style={{
              fontSize: 'clamp(40px, 12vw, 64px)',
              lineHeight: 0.92,
              letterSpacing: '-0.04em',
            }}
          >
            Bus
            <br />
            Lisbon
          </div>

          <div
            className="mt-2.5 text-carris-yellow font-mono uppercase"
            style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', letterSpacing: '0.18em' }}
          >
            38.7223° N · 9.1393° W
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-[2px] bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-carris-yellow"
                style={{
                  width: `${progress}%`,
                  transition: 'width 360ms cubic-bezier(0.22, 1, 0.36, 1)',
                  boxShadow: '0 0 8px rgba(255,204,0,0.5)',
                }}
              />
            </div>
            <div
              className="font-mono text-white/65 text-right tabular-nums"
              style={{ fontSize: 'clamp(11px, 2.5vw, 13px)', minWidth: '40px' }}
            >
              {progress}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
