import { useEffect, useRef } from 'react';
import { ArrowRight, CircleHelp, X } from 'lucide-react';

/**
 * The phone menu: navigation, the Guided view switch, How to watch, and Set up a game, in one sheet
 * behind one button. It is a native modal dialog (focus stays inside, Escape closes, focus returns to
 * the menu button). Opening it changes nothing; every item that leaves Watch goes through the same
 * App functions as the desktop controls, so they end automatic play the same way.
 */
export function MenuSheet<T extends string>({
  tabs,
  current,
  guided,
  onTab,
  onGuided,
  onHelp,
  onSetup,
  onClose,
}: {
  tabs: { id: T; label: string; secondary?: boolean }[];
  current: T;
  guided: boolean;
  onTab: (t: T) => void;
  onGuided: () => void;
  onHelp: () => void;
  onSetup: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    el?.showModal();
    el?.querySelector<HTMLElement>('nav button[aria-current="page"], nav button')?.focus({ preventScroll: true });
    // Leaving phone width closes the sheet, so it can never sit open behind the desktop bar.
    const q = window.matchMedia('(max-width: 760px)');
    const onChange = () => !q.matches && onClose();
    q.addEventListener('change', onChange);
    return () => {
      q.removeEventListener('change', onChange);
      el?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const primary = tabs.filter((t) => !t.secondary);
  const secondary = tabs.filter((t) => t.secondary);
  return (
    <dialog
      ref={ref}
      className="menu-sheet"
      aria-label="Menu"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="menu-sheet-head">
        <span>Menu</span>
        <button className="icon-button" aria-label="Close menu" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <nav aria-label="Main navigation">
        {primary.map((t) => (
          <button key={t.id} className={current === t.id ? 'active' : ''} aria-current={current === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
        {secondary.length > 0 && (
          <div className="menu-secondary">
            {secondary.map((t) => (
              <button key={t.id} className={current === t.id ? 'active' : ''} aria-current={current === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </nav>
      <div className="menu-sheet-tools">
        <button role="switch" aria-checked={guided} className={`guide-switch ${guided ? 'on' : ''}`} onClick={onGuided} aria-label="Guided view">
          <span>
            Guided view
            <small>A card walks you through each phase</small>
          </span>
          <b>{guided ? 'on' : 'off'}</b>
        </button>
        <button className="menu-row" onClick={onHelp}>
          <CircleHelp size={18} aria-hidden="true" /> How to watch
        </button>
        <button className="button menu-setup" onClick={onSetup}>
          Set up a game
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}
