import { Check, Play, Radio, Scale, Users } from 'lucide-react';
import { TERMS } from '../guided/glossary';
import { Crest, Modal } from './Shared';

/** The reference for novices: what the screen shows, the controls, costs, and the words used. */
export function Help({ onClose, onShowIntro }: { onClose: () => void; onShowIntro: () => void }) {
  return (
    <Modal title="How to watch" onClose={onClose}>
      <div className="modal-body help-body">
        <p className="modal-lede">
          You are the observer. Seven countries play an <b>alternate history</b> that starts in 1901. The first to hold{' '}
          <b>18 of the 34 supply centers</b> wins. The game can unfold differently from what really happened.
        </p>
        <div>
          <Radio />
          <h3>A phase is one round of play</h3>
          <p>
            Every phase has two parts. First, the countries send <b>private messages</b> to each other. Then each country
            seals its <b>secret orders</b>. All orders are resolved at the same moment, so nobody moves first.
          </p>
        </div>
        <div>
          <Play />
          <h3>Watch, pause, and resume</h3>
          <p>
            <b>Start game</b> plays the first phase. With Guided view on, every phase that resolves opens a walkthrough, and
            the next phase waits until you press <b>Continue watching</b>. With it off, the game plays on one phase at a time.
            <b>Pause game</b> stops it: a phase in progress stops after its current model call, and nothing new is requested.
            Closing the guide, opening a dialog, switching tabs, scrubbing the timeline, hiding the page, or refreshing all pause
            too, and nothing starts again until you press <b>Resume game</b>. <b>Play next phase</b> plays exactly one phase.
            Replaying a saved game, from History or the timeline, never plays a new phase or spends money.
          </p>
        </div>
        <div>
          <Users />
          <h3>The countries and the map</h3>
          <p>
            The panel on the left lists the countries, their supply centers out of 18, and the change since the last phase.
            On the map, a supply center’s ring shows its owner. Colored tint shows home areas and influence. Army and fleet
            markers show where units are: an army moves on land, a fleet at sea.
          </p>
        </div>
        <div>
          <Crest power="FRANCE" small />
          <h3>Guided view</h3>
          <p>
            With guided view on, each moment is explained on a card over the map: what happened, why it matters, and the map
            location. Use Back and Next event, or skip to the phase summary. While a card is open, the game waits for you.
            Turn guided view off for the full detailed view with the story and timeline.
          </p>
        </div>
        <div>
          <Scale />
          <h3>Guidance, costs, and what is recorded</h3>
          <p>
            A briefing you write is read by every AI country. Country instructions are read only by that country. Guidance
            shapes strategy and cannot change the rules, legal orders, or the results. The sandbox does not read guidance.
            AI countries are billed per model call, shown in the status bar, and stop at your budget ceiling. The sample and
            the sandbox make no model calls.
          </p>
        </div>
        <div>
          <Check />
          <h3>Words used here</h3>
          <dl className="glossary">
            {TERMS.map((t) => (
              <div key={t.word}>
                <dt>{t.word}</dt>
                <dd>{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="help-footer">
          <button className="text-button" onClick={onShowIntro}>
            Show the welcome card again
          </button>
        </div>
      </div>
    </Modal>
  );
}
