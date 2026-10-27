export function IndustrialScene() {
  return (
    <svg className="auth__scene" viewBox="0 0 720 440" aria-hidden="true">
      <g className="auth__scene-grid">
        {Array.from({ length: 9 }, (_, index) => (
          <line key={`v-${index}`} x1={36 + index * 82} y1="28" x2={36 + index * 82} y2="412" />
        ))}
        {Array.from({ length: 6 }, (_, index) => (
          <line key={`h-${index}`} x1="20" y1={48 + index * 68} x2="700" y2={48 + index * 68} />
        ))}
      </g>
      <g className="auth__rack">
        <rect x="78" y="86" width="132" height="268" />
        <rect x="294" y="86" width="132" height="268" />
        <rect x="510" y="86" width="132" height="268" />
        {[118, 174, 230, 286].map((y) => (
          <g key={y}>
            <line x1="78" y1={y} x2="210" y2={y} />
            <line x1="294" y1={y} x2="426" y2={y} />
            <line x1="510" y1={y} x2="642" y2={y} />
          </g>
        ))}
      </g>
      <g className="auth__pallet">
        <rect x="96" y="128" width="42" height="28" />
        <rect x="148" y="184" width="42" height="28" />
        <rect x="96" y="240" width="42" height="28" />
        <rect x="312" y="128" width="42" height="28" />
        <rect x="364" y="240" width="42" height="28" />
        <rect x="528" y="184" width="42" height="28" />
        <rect x="580" y="296" width="42" height="28" />
      </g>
      <g className="auth__crane">
        <line x1="252" y1="70" x2="252" y2="360" />
        <line x1="468" y1="70" x2="468" y2="360" />
        <rect x="236" y="198" width="32" height="18" />
        <rect x="452" y="154" width="32" height="18" />
        <rect x="228" y="346" width="48" height="8" />
        <rect x="444" y="346" width="48" height="8" />
      </g>
      <line className="auth__floor" x1="48" y1="368" x2="672" y2="368" />
    </svg>
  );
}
