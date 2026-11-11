import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { NATIONS } from '../domain';
import type { Power } from '../types';
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
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
