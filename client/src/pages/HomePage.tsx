import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRESETS } from '../../../shared/formats.ts';
import { getName, getToken, setName } from '../lib/identity.ts';
import { emit } from '../lib/socket.ts';
import { useToast } from '../components/Toast.tsx';

const MAX_LOCAL = 6;
const EXAMPLE_NAMES = ['Ash', 'Misty', 'Brock', 'May', 'Dawn', 'Serena'];

export function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setNameState] = useState(getName());
  const [presetId, setPresetId] = useState('standard');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'online' | 'local'>('online');
  const [localNames, setLocalNames] = useState<string[]>(() => [getName(), '']);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const names = localNames.map((n) => n.trim()).filter(Boolean);
    if (mode === 'local') {
      if (names.length < 2) return toast('Enter at least two player names', 'error');
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return toast('Player names must be different', 'error');
    } else if (!name.trim()) {
      return toast('Enter your trainer name first', 'error');
    }
    setBusy(true);
    try {
      const hostName = mode === 'local' ? names[0] : name;
      setName(hostName);
      const res = await emit<{ code: string }>('room:create', {
        name: hostName, token: getToken(), presetId, localPlayers: mode === 'local' ? names.slice(1) : [],
      });
      navigate(`/room/${res.code}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return toast('Enter a room code', 'error');
    if (name.trim()) setName(name);
    navigate(`/room/${c}`);
  };

  return (
    <div className="home">
      <section className="hero">
        <h1>Draft your dream team.</h1>
        <p>
          Every trainer gets <strong>100 points</strong> and drafts <strong>10 Pokemon</strong> turn by turn from a
          shared pool spanning all nine generations. Final evolutions, legendaries and meta threats cost more, so spend wisely.
        </p>
      </section>

      <div className="home-grid">
        <form className="panel" onSubmit={create}>
          <h2>Start a league draft</h2>
          <div className="seg mode-toggle" role="group" aria-label="Where are players drafting?">
            <button type="button" className={mode === 'online' ? 'on' : ''} onClick={() => setMode('online')}>Online (each on own device)</button>
            <button type="button" className={mode === 'local' ? 'on' : ''} onClick={() => setMode('local')}>On this device (pass & play)</button>
          </div>
          {mode === 'online' ? (
            <label>Your trainer name
              <input type="text" value={name} maxLength={24} placeholder="e.g. Ash" onChange={(e) => setNameState(e.target.value)} />
            </label>
          ) : (
            <div className="local-players">
              <span className="field-label">Players, in draft order ({localNames.length}/{MAX_LOCAL})</span>
              {localNames.map((n, i) => (
                <div key={i} className="local-row">
                  <span className="muted">{i + 1}</span>
                  <input type="text" value={n} maxLength={24} placeholder={EXAMPLE_NAMES[i] ?? `Player ${i + 1}`}
                    onChange={(e) => setLocalNames((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    aria-label={`Player ${i + 1} name`} />
                  {localNames.length > 2 && (
                    <button type="button" className="icon danger" onClick={() => setLocalNames((xs) => xs.filter((_, j) => j !== i))}
                      aria-label={`Remove player ${i + 1}`}>✕</button>
                  )}
                </div>
              ))}
              {localNames.length < MAX_LOCAL && (
                <button type="button" className="btn small ghost" onClick={() => setLocalNames((xs) => [...xs, ''])}>+ Add player</button>
              )}
              <p className="muted small">Everyone drafts from this screen. When it's someone's turn, hand them the device. You can still add bots or online players in the lobby.</p>
            </div>
          )}
          <span className="field-label">Format</span>
          <div className="presets compact">
            {PRESETS.map((p) => (
              <button type="button" key={p.id} className={`preset${presetId === p.id ? ' on' : ''}`} onClick={() => setPresetId(p.id)} title={p.description}>
                <strong>{p.name}</strong>
                <span>{p.tagline}</span>
              </button>
            ))}
          </div>
          <p className="muted small">You can fine-tune every rule (pool, budget, team rules, prices) in the lobby.</p>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating...' : mode === 'local' ? 'Set up local draft' : 'Create draft room'}</button>
        </form>

        <form className="panel" onSubmit={join}>
          <h2>Join a draft</h2>
          <label>Room code
            <input type="text" className="code-input" value={code} maxLength={5} placeholder="ABCDE"
              onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <label>Your trainer name
            <input type="text" value={name} maxLength={24} placeholder="e.g. Misty" onChange={(e) => setNameState(e.target.value)} />
          </label>
          <button className="btn">Join room</button>

          <div className="how">
            <h3>How it works</h3>
            <ol>
              <li>The host creates a room, picks a format and shares the code.</li>
              <li>Friends join (or add bots to practice). The host sets the draft order.</li>
              <li>Take turns drafting. You can't take a Pokemon that would leave you unable to fill your team.</li>
              <li>When everyone has a full roster, export your teams to Showdown.</li>
            </ol>
          </div>
        </form>
      </div>
    </div>
  );
}
