/** Original app icon artwork rendered to PNG for PWA installs. */
export function AppIcon({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 40%, #16124a, #04060d 75%)" }}>
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 512 512">
        <path d="M256 70 L420 165 L420 347 L256 442 L92 347 L92 165 Z" fill="none" stroke="#38bdf8" strokeWidth="18" strokeLinejoin="round" />
        <path d="M256 140 L360 200 L360 312 L256 372 L152 312 L152 200 Z" fill="none" stroke="#a78bfa" strokeWidth="8" strokeLinejoin="round" />
        <path d="M256 168 L296 240 L256 344 L216 240 Z" fill="#7dd3fc" />
      </svg>
    </div>
  );
}
