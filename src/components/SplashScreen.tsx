import { useEffect, useState } from 'react';

interface SplashScreenProps {
  fading: boolean;
}

/**
 * Splash screen — "Edge" layout.
 *
 * Phone: the brand artwork fills the screen edge-to-edge. A gradient lifts
 * the bottom into pure black where the wordmark, coordinates, and progress
 * bar sit.
 *
 * Larger viewports: the artwork is constrained to a centred phone-aspect
 * column so it stays composed instead of being stretched across a landscape
 * monitor. The surrounding area is the same Carris yellow as the artwork's
 * top half, so the seam is invisible.
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
      {/* Centred column. On phones it equals the viewport; on tablets / desktop
        * it's a phone-aspect frame so the portrait artwork doesn't stretch. */}
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ maxWidth: 'min(100%, 520px)' }}
      >
        <img
          src="/splash-hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 30%' }}
          loading="eager"
          decoding="sync"
        />

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

        {/* Title stack */}
        <div
          className="absolute left-0 right-0 px-5 sm:px-7"
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
