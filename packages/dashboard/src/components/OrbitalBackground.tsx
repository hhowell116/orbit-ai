export function OrbitalBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Large planet - top right */}
      <svg
        className="absolute"
        style={{ top: "-8%", right: "-5%", width: "450px", height: "450px", opacity: 0.12 }}
        viewBox="0 0 200 200"
      >
        <defs>
          <radialGradient id="planet1" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#fab283" />
            <stop offset="100%" stopColor="#9d7cd8" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="90" fill="url(#planet1)" />
        <ellipse cx="100" cy="100" rx="130" ry="30" fill="none" stroke="#fab283" strokeWidth="1.5" transform="rotate(-20 100 100)" />
      </svg>

      {/* Small planet - bottom left */}
      <svg
        className="absolute"
        style={{ bottom: "8%", left: "3%", width: "180px", height: "180px", opacity: 0.09 }}
        viewBox="0 0 200 200"
      >
        <defs>
          <radialGradient id="planet2" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#5c9cf5" />
            <stop offset="100%" stopColor="#0d1117" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="80" fill="url(#planet2)" />
      </svg>

      {/* Medium planet - center left */}
      <svg
        className="absolute"
        style={{ top: "55%", left: "-3%", width: "300px", height: "300px", opacity: 0.07 }}
        viewBox="0 0 200 200"
      >
        <defs>
          <radialGradient id="planet3" cx="45%" cy="40%">
            <stop offset="0%" stopColor="#9d7cd8" />
            <stop offset="100%" stopColor="#151b23" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="95" fill="url(#planet3)" />
        <circle cx="70" cy="75" r="15" fill="rgba(157,124,216,0.2)" />
        <circle cx="120" cy="110" r="10" fill="rgba(157,124,216,0.15)" />
      </svg>

      {/* Tiny moon - top left */}
      <svg
        className="absolute"
        style={{ top: "15%", left: "12%", width: "60px", height: "60px", opacity: 0.12 }}
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="70" fill="#5c9cf5" />
      </svg>

      {/* Tiny moon - bottom right */}
      <svg
        className="absolute"
        style={{ bottom: "20%", right: "8%", width: "40px", height: "40px", opacity: 0.1 }}
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="70" fill="#fab283" />
      </svg>

      {/* Orbit rings */}
      <svg
        className="absolute"
        style={{ top: "10%", left: "20%", width: "800px", height: "800px", opacity: 0.05 }}
        viewBox="0 0 800 800"
      >
        <ellipse cx="400" cy="400" rx="350" ry="120" fill="none" stroke="#fab283" strokeWidth="1" transform="rotate(-15 400 400)" />
        <ellipse cx="400" cy="400" rx="280" ry="90" fill="none" stroke="#5c9cf5" strokeWidth="0.8" transform="rotate(-25 400 400)" />
        <ellipse cx="400" cy="400" rx="200" ry="65" fill="none" stroke="#9d7cd8" strokeWidth="0.6" transform="rotate(-10 400 400)" />
      </svg>

      {/* Stars */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.15 }}>
        <circle cx="10%" cy="20%" r="1" fill="#e6edf3" />
        <circle cx="25%" cy="8%" r="0.8" fill="#e6edf3" />
        <circle cx="40%" cy="35%" r="0.6" fill="#fab283" />
        <circle cx="55%" cy="12%" r="1" fill="#e6edf3" />
        <circle cx="70%" cy="28%" r="0.7" fill="#e6edf3" />
        <circle cx="85%" cy="18%" r="0.9" fill="#5c9cf5" />
        <circle cx="15%" cy="65%" r="0.8" fill="#e6edf3" />
        <circle cx="30%" cy="80%" r="1" fill="#e6edf3" />
        <circle cx="50%" cy="70%" r="0.6" fill="#9d7cd8" />
        <circle cx="65%" cy="85%" r="0.8" fill="#e6edf3" />
        <circle cx="80%" cy="60%" r="1" fill="#e6edf3" />
        <circle cx="90%" cy="75%" r="0.7" fill="#fab283" />
        <circle cx="5%" cy="45%" r="0.9" fill="#e6edf3" />
        <circle cx="35%" cy="55%" r="0.6" fill="#e6edf3" />
        <circle cx="60%" cy="45%" r="1.1" fill="#e6edf3" />
        <circle cx="75%" cy="50%" r="0.5" fill="#5c9cf5" />
        <circle cx="92%" cy="40%" r="0.8" fill="#e6edf3" />
        <circle cx="48%" cy="92%" r="0.7" fill="#e6edf3" />
        <circle cx="20%" cy="95%" r="0.9" fill="#fab283" />
        <circle cx="78%" cy="90%" r="0.6" fill="#e6edf3" />
      </svg>

      {/* Warm glow */}
      <div
        className="absolute"
        style={{
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          height: "600px",
          background: "radial-gradient(ellipse, rgba(250,178,131,0.06) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
