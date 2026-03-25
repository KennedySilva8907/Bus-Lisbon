interface SplashScreenProps {
  fading: boolean;
}

export default function SplashScreen({ fading }: SplashScreenProps) {
  return (
    <div
      role="status"
      aria-label="A carregar Bus Lisbon"
      aria-hidden={fading}
      className={`fixed inset-0 z-[9999] bg-carris-dark flex flex-col items-center justify-center overflow-hidden transition-opacity duration-500 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Glow ring behind logo */}
      <div className="relative mb-6">
        <div
          className="absolute -inset-4 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,204,0,0.12) 0%, transparent 70%)' }}
        ></div>
        <div className="w-[100px] h-[100px] rounded-full overflow-hidden relative border-2 border-carris-yellow/30 shadow-[0_0_40px_rgba(255,204,0,0.1)]">
          <img
            src="/bus-logo.jpg"
            alt="Bus Lisbon logo"
            className="w-full h-full object-cover"
            loading="eager"
            decoding="sync"
            width={100}
            height={100}
          />
        </div>
      </div>

      {/* App name */}
      <h1 className="font-extrabold text-[22px] text-carris-light tracking-tight">
        Bus Lisbon
      </h1>
      <p className="text-[12px] text-gray-500 mt-1">
        Carris Metropolitana em tempo real
      </p>

      {/* Pulsing dots */}
      <div className="flex gap-1.5 items-center mt-8" aria-hidden="true">
        <div className="w-1.5 h-1.5 rounded-full bg-carris-yellow splash-dot" style={{ animationDelay: '0s' }}></div>
        <div className="w-1.5 h-1.5 rounded-full bg-carris-yellow splash-dot" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-1.5 h-1.5 rounded-full bg-carris-yellow splash-dot" style={{ animationDelay: '0.4s' }}></div>
      </div>
    </div>
  );
}
