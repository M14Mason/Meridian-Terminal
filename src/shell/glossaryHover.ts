// Glossary on hover (catalog 121): any table header, or element marked data-term, that matches a glossary
// term gets a tooltip and a dotted underline. One delegated listener for the whole app.
import { lookupTerm } from '../../shared/glossary';

export function installGlossaryHover(): () => void {
  const on = (e: Event) => {
    const el = (e.target as HTMLElement | null)?.closest?.('th, dt, [data-term]') as HTMLElement | null;
    if (!el || el.dataset.glossed) return;
    el.dataset.glossed = '1';
    const def = lookupTerm(el.dataset.term ?? el.textContent ?? '');
    if (def && !el.title) {
      el.title = def;
      el.classList.add('has-term');
    }
  };
  document.addEventListener('mouseover', on, { passive: true });
  document.addEventListener('focusin', on);
  return () => {
    document.removeEventListener('mouseover', on);
    document.removeEventListener('focusin', on);
  };
}
