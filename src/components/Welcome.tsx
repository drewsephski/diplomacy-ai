import { ArrowRight, X } from 'lucide-react';

/**
 * The first-visit welcome. A panel in the page, never a modal: the map stays visible and usable.
 * One role line and one clear way in (the free sample's first negotiation); everything else is
 * secondary. Dismissal is remembered in this browser, and How to watch brings it back.
 */
export function Welcome({
  sampleAvailable,
  onWatch,
  onExplore,
  onSetup,
  onDismiss,
}: {
  sampleAvailable: boolean;
  onWatch: () => void;
  onExplore: () => void;
  onSetup: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-text">
        <span className="eyebrow">YOU ARE THE OBSERVER</span>
        <h2 id="welcome-title">You watch. Seven independent countries decide. Nothing waits for your orders.</h2>
        <p>
          It is 1901. Each country talks in private, then all seal orders that resolve at the same moment. Follow one and see
          whether its words match its moves.
        </p>
      </div>
      <div className="welcome-actions">
        {sampleAvailable && (
          <button className="button primary welcome-start" onClick={onWatch}>
            <span>
              Watch the first negotiation
              <small>Free recorded sample · about 2 minutes</small>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
        <button className="button ghost" onClick={onExplore}>
          Explore on my own
        </button>
        <button className="text-button welcome-setup" onClick={onSetup}>
          Set up a game with AI countries
        </button>
      </div>
      <button className="icon-button welcome-close" aria-label="Hide this introduction" onClick={onDismiss}>
        <X size={18} />
      </button>
    </section>
  );
}
