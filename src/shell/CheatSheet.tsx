// Keyboard cheat sheet overlay (feature 129).
export const SHORTCUTS: [string, string][] = [
  ['/  or  Ctrl/Cmd+K', 'Focus the command line'],
  ['Enter', 'Run in the focused panel (GO)'],
  ['Alt+Enter', 'Run in a new panel'],
  ['Tab', 'Complete the highlighted function'],
  ['Up / Down', 'Command history, or move through suggestions'],
  ['F1  or  ?', 'Function list (HELP)'],
  ['Ctrl+/', 'This cheat sheet'],
  ['Alt+1 to Alt+9', 'Focus panel 1 to 9'],
  ['Alt+W', 'Close the focused panel'],
  ['Alt+M', 'Maximize or restore'],
  ['Alt+N', 'Minimize or restore'],
  ['Alt+D', 'Duplicate'],
  ['Alt+L', 'Lock or unlock'],
  ['Alt+P', 'Pop out into a window'],
  ['Double-click header', 'Maximize or restore'],
  ['Drag a tab onto a header', 'Stack panels as tabs'],
  ['Esc', 'Close overlays'],
];

export function CheatSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="overlay__box" onClick={(e) => e.stopPropagation()}>
        <h2>KEYBOARD SHORTCUTS</h2>
        <table className="grid-table">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td className="accent">{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={onClose} autoFocus>
          CLOSE
        </button>
      </div>
    </div>
  );
}
