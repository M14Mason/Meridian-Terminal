import { APP_NAME, DISCLAIMER, PROXY_URL } from './config';
import './App.css';

// M0 placeholder shell. Pairing (M1) and the full terminal shell (M2) replace this.
export function App() {
  return (
    <main className="boot">
      <h1 className="boot__title">{APP_NAME.toUpperCase()}</h1>
      <p className="boot__line">
        STATUS <span className="boot__ok">SCAFFOLD ONLINE</span>
      </p>
      <p className="boot__line">
        PROXY <span className={PROXY_URL ? 'boot__ok' : 'boot__warn'}>{PROXY_URL ? 'CONFIGURED' : 'NOT CONFIGURED'}</span>
      </p>
      <footer className="boot__footer">{DISCLAIMER}</footer>
    </main>
  );
}
