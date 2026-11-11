import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Anchor, Crosshair, Minus, MoveUpRight, Plus, Swords } from 'lucide-react';
import data from '../map-data.json';
import { NATIONS } from '../domain';
import { POWERS, type Board, type Power, type Turn } from '../types';
const coords = data.coords as Record<string, { x: number; y: number }>;
const centers = data.centers as Record<string, { x: number; y: number }>;
const homeland: Record<Power, string[]> = {
  ENGLAND: ['CLY', 'EDI', 'LVP', 'YOR', 'WAL', 'LON'],
  FRANCE: ['BRE', 'PIC', 'PAR', 'BUR', 'GAS', 'MAR'],
  GERMANY: ['KIE', 'BER', 'PRU', 'RUH', 'MUN', 'SIL'],
  ITALY: ['PIE', 'VEN', 'TUS', 'ROM', 'APU', 'NAP'],
  AUSTRIA: ['TYR', 'BOH', 'VIE', 'TRI', 'BUD', 'GAL'],
  RUSSIA: ['STP', 'FIN', 'LVN', 'MOS', 'WAR', 'UKR', 'SEV'],
  TURKEY: ['CON', 'SMY', 'ANK', 'ARM', 'SYR'],
};
const labels: { power: Power; x: number; y: number; text: string }[] = [
  { power: 'ENGLAND', x: 410, y: 657, text: 'BRITAIN' },
  { power: 'FRANCE', x: 470, y: 925, text: 'FRANCE' },
  { power: 'GERMANY', x: 760, y: 777, text: 'GERMANY' },
  { power: 'ITALY', x: 700, y: 1040, text: 'ITALY' },
  { power: 'AUSTRIA', x: 905, y: 864, text: 'AUSTRIA–HUNGARY' },
  { power: 'RUSSIA', x: 1260, y: 650, text: 'RUSSIA' },
  { power: 'TURKEY', x: 1360, y: 1190, text: 'OTTOMAN EMPIRE' },
];
export function EuropeMap({
  board,
  selected,
  onSelect,
  turn,
  compact = false,
  focus,
  highlight = [],
  children,
}: {
  board: Board;
  selected?: Power;
  onSelect?: (p: Power) => void;
  turn?: Turn;
  compact?: boolean;
  /** Changing `nonce` centers and zooms the map on `code`, and shows its province card. */
  focus?: { code: string; nonce: number };
  /** Base province codes to outline, such as the provinces named by the current guided moment. */
  highlight?: string[];
  /** Overlay content rendered over the map, such as the guide card. */
  children?: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showOrders, setShowOrders] = useState(false);
  const [province, setProvince] = useState<string>();
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!focus) return;
    const base = focus.code.split('/')[0];
    const point = coords[focus.code] ?? coords[base] ?? centers[base];
    if (!point) return;
    // Pan so the chosen point sits at the view center (850, 820) at a closer zoom.
    const next = 1.7;
    setZoom(next);
    setPan({ x: (850 - point.x) * next, y: (820 - point.y) * next });
    setProvince(base);
  }, [focus?.nonce, focus?.code]);
  const colors: Record<string, Power> = {};
  for (const p of POWERS) for (const loc of homeland[p]) colors[loc] = p;
  for (const p of POWERS) for (const loc of board.influence[p]) colors[loc.slice(0, 3)] = p;
  for (const p of POWERS) for (const loc of board.centers[p]) colors[loc] = p;
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      drag.current.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const scale = 1500 / e.currentTarget.clientWidth;
    setPan({ x: drag.current.px + dx * scale, y: drag.current.py + dy * scale });
  }
  function select(id: string) {
    if (drag.current?.moved) return;
    setProvince(id);
    if (colors[id]) onSelect?.(colors[id]);
  }
  const orderLines =
    turn && showOrders
      ? POWERS.flatMap((p) => turn.decisions[p].orders.map((order) => ({ order, p }))).filter(
          ({ order }) => order.includes(' - ') && !order.includes(' S ') && !order.includes(' C '),
        )
      : [];
  return (
    <div className={`europe-map ${compact ? 'compact' : ''}`}>
      <svg
        role="img"
        aria-label="Interactive standard Diplomacy map of Europe. Select countries in the power list or on the map."
        viewBox="120 290 1500 1060"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => {
          window.setTimeout(() => {
            drag.current = null;
          }, 0);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <pattern
            id="sea-grid"
            width="95"
            height="95"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            <path
              d="M 95 0 L 0 0 0 95"
              fill="none"
              stroke="#45606a"
              strokeWidth=".8"
              opacity=".19"
            />
          </pattern>
          <pattern id="land-hatch" width="7" height="7" patternUnits="userSpaceOnUse">
            <path d="M0 7L7 0" stroke="#eee1c1" strokeWidth=".45" opacity=".09" />
          </pattern>
          <radialGradient id="sea-glow">
            <stop offset="0%" stopColor="#1c3039" />
            <stop offset="100%" stopColor="#101d25" />
          </radialGradient>
          <filter id="land-shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity=".4" />
          </filter>
          <marker
            id="move-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#f0d39b" />
          </marker>
        </defs>
        <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#sea-glow)" />
        <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#sea-grid)" />
        <g
          transform={`translate(${pan.x} ${pan.y}) translate(850 820) scale(${zoom}) translate(-850 -820)`}
        >
          <g transform="translate(-195 -170)" filter="url(#land-shadow)">
            {data.paths.map((path) => (
              <path
                key={path.id}
                d={path.d}
                className={`province ${path.water ? 'water' : ''} ${colors[path.id] === selected ? 'selected' : ''} ${highlight.includes(path.id) ? 'guide-target' : ''}`}
                fill={
                  path.water
                    ? 'transparent'
                    : path.impassable
                      ? '#242f32'
                      : colors[path.id]
                        ? NATIONS[colors[path.id]].color
                        : '#777969'
                }
                fillOpacity={path.water ? 0 : colors[path.id] === selected ? 0.61 : 0.39}
                stroke={path.water ? '#53707b' : '#b2ae8f'}
                strokeWidth={path.water ? 1 : 1.5}
                strokeOpacity={path.water ? 0.25 : 0.55}
                onClick={() => select(path.id)}
              >
                <title>
                  {path.id}
                  {colors[path.id]
                    ? ` · ${NATIONS[colors[path.id]].name} influence`
                    : path.impassable
                      ? ' · impassable'
                      : ' · neutral'}
                </title>
              </path>
            ))}
            {data.paths
              .filter((p) => !p.water)
              .map((path) => (
                <path key={path.id} d={path.d} fill="url(#land-hatch)" pointerEvents="none" />
              ))}
          </g>
          <g className="sea-labels" textAnchor="middle">
            <text x="270" y="870" transform="rotate(-18 270 870)">
              Atlantic Ocean
            </text>
            <text x="620" y="590">
              North Sea
            </text>
            <text x="1210" y="1000">
              Black Sea
            </text>
            <text x="630" y="1240">
              Mediterranean Sea
            </text>
            <text x="830" y="410">
              Scandinavia
            </text>
          </g>
          {labels.map((l) => (
            <text
              key={l.power}
              x={l.x}
              y={l.y}
              className={`country-label ${l.power === selected ? 'active' : ''}`}
              textAnchor="middle"
              onClick={() => onSelect?.(l.power)}
            >
              {l.text}
            </text>
          ))}
          {!compact &&
            Object.entries(coords)
              .filter(([loc]) => !loc.includes('/') && !['NAO', 'NWG', 'BAR', 'MAO'].includes(loc))
              .map(([loc, c]) => (
                <text key={loc} x={c.x} y={c.y + 28} className="province-label" textAnchor="middle">
                  {loc}
                </text>
              ))}
          {Object.entries(centers).map(([loc, c]) => {
            const owner = POWERS.find((p) => board.centers[p].includes(loc));
            return (
              <g
                key={loc}
                transform={`translate(${c.x},${c.y})`}
                onClick={() => select(loc)}
                className="center-marker"
              >
                <circle
                  r="8"
                  fill="#172128"
                  stroke={owner ? NATIONS[owner].color : '#b8a87e'}
                  strokeWidth="2"
                />
                <circle r="3" fill={owner ? NATIONS[owner].color : '#b8a87e'} />
                <title>
                  {loc} supply center · {owner ? NATIONS[owner].name : 'neutral'}
                </title>
              </g>
            );
          })}
          {orderLines.map(({ order, p }) => {
            const a = coords[order.split(' ')[1]];
            const b = coords[order.split(' - ')[1].split(' ')[0]];
            if (!a || !b) return null;
            return (
              <path
                key={p + order}
                d={`M${a.x},${a.y} Q${(a.x + b.x) / 2 + 20},${(a.y + b.y) / 2 - 22} ${b.x},${b.y}`}
                fill="none"
                stroke="#f0d39b"
                strokeWidth="3"
                strokeDasharray={
                  turn?.results[order.split(' ').slice(0, 2).join(' ')]?.length ? '6 5' : undefined
                }
                markerEnd="url(#move-arrow)"
                opacity=".85"
              />
            );
          })}
          {POWERS.flatMap((p) =>
            board.units[p].map((unit) => {
              const c = coords[unit.replace('*', '').split(' ')[1]];
              if (!c) return null;
              const moveOrder = turn?.decisions[p].orders.find((order) => {
                const parts = order.split(' ');
                return (
                  parts[0] === unit[0] &&
                  parts[2] === '-' &&
                  parts[3] === unit.split(' ')[1] &&
                  !turn.results[parts.slice(0, 2).join(' ')]?.length
                );
              });
              const origin = moveOrder ? coords[moveOrder.split(' ')[1]] : undefined;
              const animate =
                origin && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              return (
                <g
                  key={p + unit}
                  transform={`translate(${c.x},${c.y})`}
                  className="unit"
                  onClick={() => onSelect?.(p)}
                >
                  {animate && (
                    <animateTransform
                      key={turn?.phase + unit}
                      attributeName="transform"
                      type="translate"
                      from={`${origin.x} ${origin.y}`}
                      to={`${c.x} ${c.y}`}
                      dur="0.65s"
                      fill="freeze"
                    />
                  )}
                  <circle r="15" fill="#122129" stroke={NATIONS[p].color} strokeWidth="2" />
                  {unit.startsWith('F') ? (
                    <path
                      d="M-9 3H9L5 8H-5ZM0 -9V2M-5 0L0-7L5 0"
                      stroke={NATIONS[p].color}
                      fill={NATIONS[p].color}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <>
                      <path
                        d="M-6 -5L6 7M6 -5L-6 7M-8 -3L-4 -7M4 -7L8 -3"
                        stroke={NATIONS[p].color}
                        strokeWidth="2.5"
                      />
                      <circle cy="-10" r="2" fill={NATIONS[p].color} />
                    </>
                  )}
                  <title>
                    {NATIONS[p].name}: {unit}
                  </title>
                </g>
              );
            }),
          )}
        </g>
      </svg>
      {!compact && (
        <>
          <div className="map-title">
            <span className="map-coordinate">THE EUROPEAN THEATER · 1901</span>
            <h1>Europe, on the brink.</h1>
            <p>Seven minds. One continent. No certain allies.</p>
          </div>
          <div className="compass" aria-hidden="true">
            <span>N</span>
            <svg viewBox="0 0 60 60">
              <path
                d="M30 4L35 25L56 30L35 35L30 56L25 35L4 30L25 25Z"
                fill="none"
                stroke="currentColor"
              />
              <path
                d="M30 4L30 30L25 25Z M56 30L30 30L35 25Z M30 56L30 30L35 35Z M4 30L30 30L25 35Z"
                fill="currentColor"
              />
              <circle cx="30" cy="30" r="20" fill="none" stroke="currentColor" opacity=".4" />
            </svg>
          </div>
          <div className="map-legend" role="group" aria-label="Map key">
            <span>
              <Swords size={13} aria-hidden="true" /> Army
            </span>
            <span>
              <Anchor size={13} aria-hidden="true" /> Fleet
            </span>
            <span title="The ring on each center shows its actual owner. A gold ring means neutral.">
              <i className="key-ring" aria-hidden="true" /> Supply center · ring = owner
            </span>
            <span title="Colored provinces show each power's home area and influence. A supply center takes its owner's color.">
              <i className="key-tint" aria-hidden="true" /> Tint = home &amp; influence
            </span>
          </div>
          <div className="map-tools">
            <button
              title="Show revealed movement orders"
              aria-label="Show revealed movement orders"
              aria-pressed={showOrders}
              onClick={() => setShowOrders((v) => !v)}
              className={showOrders ? 'active' : ''}
            >
              <MoveUpRight size={17} />
            </button>
            <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(z + 0.2, 2.6))}>
              <Plus size={17} />
            </button>
            <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.65))}>
              <Minus size={17} />
            </button>
            <button
              aria-label="Fit whole map"
              onClick={() => {
                setZoom(0.8);
                setPan({ x: 0, y: 80 });
              }}
            >
              <Crosshair size={16} />
            </button>
          </div>
          {children}
          {province && (
            <div className="province-info">
              <b>{province}</b>
              <span>
                {colors[province] ? NATIONS[colors[province]].name : 'Neutral territory'}
                {centers[province] ? ' · Supply center' : ''}
              </span>
              <button aria-label="Dismiss province" onClick={() => setProvince(undefined)}>
                ×
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
