import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, LockKeyhole, ArrowRight } from 'lucide-react';
import { NATIONS } from '../domain';
import type { Dispatch, Power } from '../types';
export function Crest({ power, small = false }: { power: Power; small?: boolean }) {
  return (
    <span
      className={`crest ${small ? 'small' : ''}`}
      style={{ color: NATIONS[power].color, background: `${NATIONS[power].color}12` }}
    >
      {NATIONS[power].initials}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    el?.showModal();
    // Put focus on the first form control (data-autofocus) or the first control in the dialog.
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('.modal-body input, .modal-body button, .modal-body [tabindex="0"]');
    first?.focus({ preventScroll: true });
    return () => {
      el?.close();
      // Return focus to whatever opened the dialog, so keyboard users resume where they were.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function DispatchCard({
  message,
  expanded = false,
}: {
  message: Dispatch;
  expanded?: boolean;
}) {
  return (
    <article className={`dispatch ${message.kind}`}>
      <div className="dispatch-heading">
        <Crest power={message.from} small />
        <span style={{ color: NATIONS[message.from].color }}>{NATIONS[message.from].name}</span>
        <ArrowRight size={12} />
        <span>{message.to.map((p) => NATIONS[p].name).join(', ')}</span>
        <LockKeyhole size={12} className="lock" />
      </div>
      <p>“{message.text}”</p>
      <div className="dispatch-meta">
        <span>{message.to.length > 1 ? 'Group diplomacy' : 'Private channel'}</span>
        <span>{message.round < 0 ? 'Observer intervention' : `Round ${message.round + 1}`}</span>
      </div>
      {expanded && message.promise && (
        <div className="promise-inline">
          Committed order <code>{message.promise}</code>
        </div>
      )}
    </article>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
