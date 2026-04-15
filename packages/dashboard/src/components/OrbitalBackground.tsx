import { useMemo } from "react";

// Generate deterministic star positions
function generateStars(count: number, seed: number) {
  const stars = [];
  let s = seed;
  const next = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    stars.push({
      x: next() * 100,
      y: next() * 100,
      size: 0.3 + next() * 1.5,
      opacity: 0.2 + next() * 0.8,
      delay: next() * 5,
      duration: 2 + next() * 4,
      color: next() > 0.85 ? (next() > 0.5 ? "#a78bfa" : "#7dd3fc") : "#e2e8f0",
    });
  }
  return stars;
}

export function OrbitalBackground() {
  const stars = useMemo(() => generateStars(120, 42), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Deep space base gradient */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at 20% 50%, rgba(88, 28, 135, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(30, 64, 175, 0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(157, 23, 77, 0.06) 0%, transparent 50%)",
      }} />

      {/* Nebula cloud - top right */}
      <div className="absolute" style={{
        top: "-10%", right: "-5%", width: "700px", height: "700px",
        background: "radial-gradient(ellipse at center, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 40%, transparent 70%)",
        filter: "blur(60px)",
        animation: "nebulaDrift 30s ease-in-out infinite alternate",
      }} />

      {/* Nebula cloud - bottom left */}
      <div className="absolute" style={{
        bottom: "-15%", left: "-10%", width: "800px", height: "600px",
        background: "radial-gradient(ellipse at center, rgba(250, 178, 131, 0.06) 0%, rgba(157, 124, 216, 0.04) 40%, transparent 70%)",
        filter: "blur(80px)",
        animation: "nebulaDrift 25s ease-in-out infinite alternate-reverse",
      }} />

      {/* Central warm glow */}
      <div className="absolute" style={{
        top: "40%", left: "50%", transform: "translate(-50%, -50%)",
        width: "900px", height: "600px",
        background: "radial-gradient(ellipse at center, rgba(250, 178, 131, 0.04) 0%, transparent 60%)",
        filter: "blur(40px)",
      }} />

      {/* Animated stars */}
      <svg className="absolute inset-0 w-full h-full">
        {stars.map((star, i) => (
          <circle
            key={i}
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.size}
            fill={star.color}
            opacity={star.opacity}
            style={{
              animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </svg>

      {/* Large planet with atmospheric glow - top right */}
      <div className="absolute" style={{ top: "-4%", right: "-2%", width: "350px", height: "350px" }}>
        {/* Atmospheric glow */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(circle at 40% 40%, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 40%, transparent 60%)",
          filter: "blur(20px)",
          transform: "scale(1.3)",
        }} />
        <svg viewBox="0 0 200 200" className="w-full h-full" style={{ opacity: 0.15 }}>
          <defs>
            <radialGradient id="planet1" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="50%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#1e1b4b" />
            </radialGradient>
            <radialGradient id="planetShine1" cx="30%" cy="30%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="85" fill="url(#planet1)" />
          <circle cx="100" cy="100" r="85" fill="url(#planetShine1)" />
          {/* Ring */}
          <ellipse cx="100" cy="100" rx="120" ry="25" fill="none" stroke="rgba(167, 139, 250, 0.4)" strokeWidth="2" transform="rotate(-20 100 100)" />
          <ellipse cx="100" cy="100" rx="120" ry="25" fill="none" stroke="rgba(167, 139, 250, 0.15)" strokeWidth="6" transform="rotate(-20 100 100)" />
        </svg>
      </div>

      {/* Small blue planet - bottom left */}
      <div className="absolute" style={{ bottom: "10%", left: "5%", width: "120px", height: "120px" }}>
        <div className="absolute inset-0" style={{
          background: "radial-gradient(circle, rgba(56, 189, 248, 0.1) 0%, transparent 60%)",
          filter: "blur(15px)", transform: "scale(1.5)",
        }} />
        <svg viewBox="0 0 200 200" className="w-full h-full" style={{ opacity: 0.12 }}>
          <defs>
            <radialGradient id="planet2" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#0c4a6e" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="80" fill="url(#planet2)" />
        </svg>
      </div>

      {/* Orbit rings - subtle, centered */}
      <svg className="absolute" style={{
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "1200px", height: "800px", opacity: 0.04,
      }} viewBox="0 0 1200 800">
        <ellipse cx="600" cy="400" rx="500" ry="150" fill="none" stroke="#a78bfa" strokeWidth="1" transform="rotate(-8 600 400)" />
        <ellipse cx="600" cy="400" rx="380" ry="110" fill="none" stroke="#fab283" strokeWidth="0.8" transform="rotate(-15 600 400)" />
        <ellipse cx="600" cy="400" rx="250" ry="75" fill="none" stroke="#7dd3fc" strokeWidth="0.6" transform="rotate(-5 600 400)" />
      </svg>

      {/* Shooting star - occasional */}
      <div className="absolute" style={{
        top: "15%", left: "30%", width: "100px", height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
        transform: "rotate(-35deg)",
        animation: "shootingStar 8s ease-in-out infinite",
        opacity: 0,
      }} />
      <div className="absolute" style={{
        top: "60%", left: "65%", width: "80px", height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.5), transparent)",
        transform: "rotate(-40deg)",
        animation: "shootingStar 12s ease-in-out 4s infinite",
        opacity: 0,
      }} />
    </div>
  );
}
