import { ArrowRight, X } from 'lucide-react';

/**
 * The welcome card: who the observer is, what the game is, and three clear starts. It never blocks
 * the map, and it can be dismissed. Alternate-history status is stated once, here and in Help.
 */
export function Orientation({
  onSetup,
  onSample,
  onSandbox,
  onDismiss,
  sampleAvailable,
}: {
  onSetup: () => void;
  onSample: () => void;
  onSandbox: () => void;
  onDismiss: () => void;
  sampleAvailable: boolean;
}) {
  return (
    <section className="orientation" aria-label="About this game">
      <div className="orientation-text">
        <span className="eyebrow">YOU ARE THE OBSERVER</span>
        <p>
          Seven countries compete for <b>18 of the 34 supply centers</b>. They talk privately, then every country’s orders
          resolve at the same moment. The game starts in 1901 and is an alternate history: it can unfold differently from what
          really happened.
        </p>
      </div>
      <div className="orientation-actions">
        <button className="button" onClick={onSetup}>
          Set up a game
          <ArrowRight size={14} />
        </button>
        {sampleAvailable && (
          <button className="text-button" onClick={onSample}>
            Watch a labelled sample with a guide
          </button>
        )}
        <button className="text-button" onClick={onSandbox}>
          Try the no-cost sandbox
        </button>
        <button className="icon-button" aria-label="Hide this introduction" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>
    </section>
  );
}
