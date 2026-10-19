import { APP_NAME, DISCLAIMER } from '../../config';
import type { PanelProps } from '../types';

// About and third-party notices (22.3, 22.5).
export default function AboutPanel(_: PanelProps) {
  return (
    <div className="about">
      <p>
        <strong>{APP_NAME}</strong>. {DISCLAIMER}
      </p>
      <p className="muted">Personal use only. Free data tiers restrict redistribution. Do not share screenshots of licensed data publicly.</p>
      <h3>Third-party notices</h3>
      <ul>
        <li>React, Vite: MIT license.</li>
        <li>GSAP: GreenSock standard no-charge license (gsap.com/standard-license).</li>
        <li>IBM Plex Mono: SIL Open Font License 1.1 (fonts/OFL-IBM-Plex-Mono.txt).</li>
      </ul>
      <p className="muted">Data sources and their terms are listed in docs/DATA_SOURCES.md and docs/LICENSES.md in the repo.</p>
    </div>
  );
}
