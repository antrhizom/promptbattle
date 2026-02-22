'use client';

import { useState, useEffect, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, set, update, push, get } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react';

type GamePhase = 'lobby' | 'creating' | 'voting' | 'results';
type Role = 'host' | 'player' | 'spectator';

interface Player {
  id: string;
  name: string;
  role: 'host' | 'player';
  prompt: string;
  imageUrl: string;
  votes: number;
  topic: string;
}

interface GameSettings {
  promptTime: number;
  votingTime: number;
}

interface GameState {
  phase: GamePhase;
  players: { [id: string]: Player };
  settings: GameSettings;
  timeRemaining: number;
  hostId: string;
  topic: string;
}

// ─── Themen-Pool ────────────────────────────────────────────────────────────
const TOPICS = [
  'Ein Roboter lernt kochen – aber er versteht Zutaten wörtlich',
  'Die letzte Bibliothek der Welt, bewacht von einem Drachen',
  'Ein Supermarkt auf dem Mond um Mitternacht',
  'Wenn Tiere plötzlich Berufe hätten: die Generalversammlung',
  'Eine Zeitmaschine, die nur in die Vergangenheit der eigenen Wohnung reist',
  'Das erste Café im Ozean – für Meeresbewohner',
  'Ein Zirkus, der durch den Weltraum reist',
  'Ein Museum für vergessene Träume',
  'Der älteste Baum der Welt hält eine Rede',
  'Ein Detektiv, der nur Geheimnisse von Wolken löst',
  'Die Stadt, in der es verboten ist zu schlafen',
  'Ein Koch, der Emotionen als Zutaten verwendet',
  'Der Briefträger der Zukunft liefert Erinnerungen',
  'Ein Konzert für Tiere im Regenwald',
  'Die geheime Schule für Drachen im 21. Jahrhundert',
];

function getRandomTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function Home() {
  // Screen state
  type Screen = 'start' | 'join' | 'game';
  const [screen, setScreen] = useState<Screen>('start');

  // User state
  const [myName, setMyName] = useState('');
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [gameId, setGameId] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Game state
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [players, setPlayers] = useState<{ [id: string]: Player }>({});
  const [settings, setSettings] = useState<GameSettings>({ promptTime: 120, votingTime: 30 });
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [globalTopic, setGlobalTopic] = useState('');
  const [hostId, setHostId] = useState('');

  // Local player state
  const [myPrompt, setMyPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── URL-Parameter auslesen (Einladungslink) ────────────────────────────────
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const gId = urlParams.get('game');
    if (gId) {
      setJoinCode(gId.slice(-6).toUpperCase());
      setScreen('join');
    }
  }, []);

  // ─── Firebase Listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return;
    const gameRef = ref(database, `games/${gameId}`);
    const unsub = onValue(gameRef, (snap) => {
      const data = snap.val() as GameState | null;
      if (!data) return;
      setPhase(data.phase);
      setPlayers(data.players || {});
      setSettings(data.settings);
      setTimeRemaining(data.timeRemaining || 0);
      setGlobalTopic(data.topic || '');
      setHostId(data.hostId || '');
    });
    return () => unsub();
  }, [gameId]);

  // ─── Timer Manager (nur Host) ─────────────────────────────────────────────
  useEffect(() => {
    if (!gameId || myRole !== 'host') return;
    if (timerRef.current) clearInterval(timerRef.current);

    if (phase === 'creating' || phase === 'voting') {
      timerRef.current = setInterval(async () => {
        const snap = await get(ref(database, `games/${gameId}`));
        const current = snap.val() as GameState;
        if (!current) return;
        const newTime = current.timeRemaining - 1;
        if (newTime <= 0) {
          if (current.phase === 'creating') {
            await update(ref(database, `games/${gameId}`), { phase: 'voting', timeRemaining: current.settings.votingTime });
          } else if (current.phase === 'voting') {
            await update(ref(database, `games/${gameId}`), { phase: 'results', timeRemaining: 0 });
          }
        } else {
          await update(ref(database, `games/${gameId}`), { timeRemaining: newTime });
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameId, phase, myRole]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getGameLink = () =>
    typeof window !== 'undefined' ? `${window.location.origin}?game=${gameId}` : '';

  const getShortCode = () => gameId.slice(-6).toUpperCase();

  const copyLink = () => {
    navigator.clipboard.writeText(getGameLink());
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Host: Neues Spiel erstellen */
  const createGame = async () => {
    if (!myName.trim()) return;
    const topic = getRandomTopic();
    const newRef = push(ref(database, 'games'));
    const gId = newRef.key!;

    const hostPlayerId = push(ref(database, `games/${gId}/players`)).key!;
    const hostPlayer: Player = {
      id: hostPlayerId,
      name: myName,
      role: 'host',
      prompt: '',
      imageUrl: '',
      votes: 0,
      topic,
    };

    const initialState: GameState = {
      phase: 'lobby',
      players: { [hostPlayerId]: hostPlayer },
      settings: { promptTime: 120, votingTime: 30 },
      timeRemaining: 0,
      hostId: hostPlayerId,
      topic,
    };

    await set(newRef, initialState);
    setGameId(gId);
    setMyPlayerId(hostPlayerId);
    setMyRole('host');
    setGlobalTopic(topic);
    setScreen('game');
  };

  /** Eingeladene: per Code beitreten */
  const joinGame = async (asRole: 'player' | 'spectator') => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    // Suche Game mit diesem Kurz-Code (letzte 6 Zeichen der gameId)
    const snap = await get(ref(database, 'games'));
    if (!snap.exists()) { alert('Spiel nicht gefunden!'); return; }

    let foundGameId: string | null = null;
    snap.forEach((child) => {
      if (child.key && child.key.slice(-6).toUpperCase() === code) {
        foundGameId = child.key;
      }
    });

    if (!foundGameId) { alert('Spiel nicht gefunden! Prüfe den Code.'); return; }

    const gId = foundGameId;
    const gameSnap = await get(ref(database, `games/${gId}`));
    const gameData = gameSnap.val() as GameState;

    if (gameData.phase !== 'lobby') { alert('Das Spiel hat bereits begonnen!'); return; }

    if (asRole === 'player') {
      if (!myName.trim()) return;
      const playerCount = Object.keys(gameData.players || {}).length;
      if (playerCount >= 4) { alert('Spiel ist voll! Maximal 4 Mitstreiterinnen.'); return; }

      const newPlayerId = push(ref(database, `games/${gId}/players`)).key!;
      const newPlayer: Player = {
        id: newPlayerId,
        name: myName,
        role: 'player',
        prompt: '',
        imageUrl: '',
        votes: 0,
        topic: gameData.topic,
      };
      await set(ref(database, `games/${gId}/players/${newPlayerId}`), newPlayer);
      setMyPlayerId(newPlayerId);
      setMyRole('player');
    } else {
      setMyRole('spectator');
    }

    setGameId(gId);
    setScreen('game');
  };

  const startGame = async () => {
    if (Object.keys(players).length < 2) return;
    await update(ref(database, `games/${gameId}`), {
      phase: 'creating',
      timeRemaining: settings.promptTime,
    });
  };

  const updateSettings = async (patch: Partial<GameSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    if (gameId) await update(ref(database, `games/${gameId}/settings`), updated);
  };

  const generateImage = async () => {
    if (!myPrompt.trim()) return;
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) { alert('OpenAI API Key fehlt.'); return; }
    setIsGenerating(true);
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'dall-e-3', prompt: myPrompt, n: 1, size: '1024x1024' }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message); }
      const data = await res.json();
      await update(ref(database, `games/${gameId}/players/${myPlayerId}`), {
        prompt: myPrompt,
        imageUrl: data.data[0].url,
      });
    } catch (e: any) {
      alert(`Fehler: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const vote = async (playerId: string) => {
    if (hasVoted || phase !== 'voting') return;
    if (myRole !== 'spectator') return; // Nur Zuschauer stimmen ab
    const current = players[playerId]?.votes || 0;
    await update(ref(database, `games/${gameId}/players/${playerId}`), { votes: current + 1 });
    setHasVoted(true);
  };

  const resetGame = async () => {
    const topic = getRandomTopic();
    const snap = await get(ref(database, `games/${gameId}/players`));
    const updates: Record<string, unknown> = {
      phase: 'lobby',
      timeRemaining: 0,
      topic,
    };
    if (snap.exists()) {
      Object.keys(snap.val()).forEach((pId) => {
        updates[`players/${pId}/prompt`] = '';
        updates[`players/${pId}/imageUrl`] = '';
        updates[`players/${pId}/votes`] = 0;
        updates[`players/${pId}/topic`] = topic;
      });
    }
    await update(ref(database, `games/${gameId}`), updates);
    setHasVoted(false);
    setMyPrompt('');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREENS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Start-Screen ──────────────────────────────────────────────────────────
  if (screen === 'start') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🎨</div>
            <h1 className="text-3xl font-black text-gray-800">Prompt Battle</h1>
            <p className="text-gray-500 mt-1 text-sm">KI-Bilderwettbewerb</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">Dein Name</label>
              <input
                type="text"
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createGame()}
                placeholder="Name eingeben..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-gray-800 text-base"
                maxLength={20}
              />
            </div>

            <button
              onClick={createGame}
              disabled={!myName.trim()}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white py-3 rounded-xl font-bold text-base hover:opacity-90 disabled:opacity-40 transition shadow"
            >
              Neues Spiel erstellen
            </button>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-gray-400 text-sm">oder</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <button
              onClick={() => setScreen('join')}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-base hover:bg-gray-200 transition"
            >
              Mit Code beitreten
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Join-Screen ───────────────────────────────────────────────────────────
  if (screen === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-teal-400 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔗</div>
            <h1 className="text-2xl font-black text-gray-800">Einladung annehmen</h1>
            <p className="text-gray-500 text-sm mt-1">Gib den 6-stelligen Code ein</p>
          </div>

          {/* Grosser Code-Input */}
          <div className="mb-6">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="CODE"
              className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-center text-3xl font-black tracking-widest text-gray-800 uppercase"
              maxLength={6}
            />
          </div>

          {/* Name nur für Mitspieler */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-600 mb-1">Dein Name (für Mitstreiterinnen)</label>
            <input
              type="text"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="Name eingeben..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-gray-800"
              maxLength={20}
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={() => joinGame('player')}
              disabled={!joinCode.trim() || !myName.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-40 transition shadow"
            >
              Als Mitstreiterin beitreten
            </button>
            <button
              onClick={() => joinGame('spectator')}
              disabled={!joinCode.trim()}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition"
            >
              Als Zuschauerin beitreten
            </button>
          </div>

          <button
            onClick={() => setScreen('start')}
            className="mt-4 w-full text-gray-400 text-sm hover:text-gray-600 transition"
          >
            ← Zurück
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME SCREENS
  // ═══════════════════════════════════════════════════════════════════════════

  const playersList = Object.values(players);
  const isHost = myRole === 'host';
  const isPlayer = myRole === 'host' || myRole === 'player';
  const myPlayer = players[myPlayerId];

  // ─── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const shortCode = getShortCode();

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Header */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-gray-800">Prompt Battle</h1>
                <p className="text-gray-500 text-sm">
                  {isHost ? 'Du bist die Spielleiterin' : myRole === 'player' ? 'Du bist Mitstreiterin' : 'Du schaust zu'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Spieler</div>
                <div className="text-3xl font-black text-purple-600">{playersList.length}/4</div>
              </div>
            </div>
          </div>

          {/* Einladungs-Box – immer sichtbar */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Einladung teilen</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* QR-Code */}
              <div className="flex flex-col items-center">
                <div className="p-3 bg-white border-2 border-gray-200 rounded-xl inline-block mb-3">
                  <QRCodeSVG value={getGameLink()} size={160} level="H" includeMargin />
                </div>
                <p className="text-xs text-gray-500">Kamera auf QR-Code richten</p>
              </div>

              {/* Code + Link */}
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">6-stelliger Code</div>
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl px-4 py-3 text-center">
                    <span className="text-4xl font-black tracking-widest text-purple-700">{shortCode}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-center">Auf phone-battle.app (oder Link oben) eingeben</p>
                </div>

                <button
                  onClick={copyLink}
                  className="w-full bg-purple-100 text-purple-700 py-2 rounded-lg font-semibold text-sm hover:bg-purple-200 transition"
                >
                  Link kopieren
                </button>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <strong>Thema wird automatisch zugeteilt</strong> – alle Spielerinnen bekommen dieselbe Aufgabe nach dem Beitreten.
                </div>
              </div>
            </div>
          </div>

          {/* Thema */}
          {globalTopic && (
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-2">Zugewiesenes Thema</h2>
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl">
                <p className="text-gray-800 text-base font-medium">{globalTopic}</p>
              </div>
              {isHost && (
                <button
                  onClick={async () => {
                    const topic = getRandomTopic();
                    setGlobalTopic(topic);
                    await update(ref(database, `games/${gameId}`), { topic });
                    const snap = await get(ref(database, `games/${gameId}/players`));
                    if (snap.exists()) {
                      const updates: Record<string, string> = {};
                      Object.keys(snap.val()).forEach((pId) => { updates[`${pId}/topic`] = topic; });
                      await update(ref(database, `games/${gameId}/players`), updates);
                    }
                  }}
                  className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 transition"
                >
                  Anderes Thema ziehen
                </button>
              )}
            </div>
          )}

          {/* Spielerliste */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Teilnehmende</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {playersList.map((p) => (
                <div key={p.id} className="p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl text-center">
                  <div className="text-2xl mb-1">{p.role === 'host' ? '👑' : '⚔️'}</div>
                  <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.role === 'host' ? 'Spielleiterin' : 'Mitstreiterin'}</div>
                </div>
              ))}
              {/* Leere Slots */}
              {Array.from({ length: Math.max(0, 4 - playersList.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="p-3 border-2 border-dashed border-gray-200 rounded-xl text-center">
                  <div className="text-2xl mb-1 opacity-20">?</div>
                  <div className="text-xs text-gray-300">Wartet...</div>
                </div>
              ))}
            </div>
          </div>

          {/* Einstellungen (nur Host) */}
          {isHost && (
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Einstellungen</h2>
              <div className="space-y-4">
                <div>
                  <label className="flex justify-between text-sm font-medium text-gray-600 mb-1">
                    <span>Prompt-Zeit</span>
                    <span className="font-bold text-purple-600">{settings.promptTime}s</span>
                  </label>
                  <input type="range" min="30" max="300" step="30" value={settings.promptTime}
                    onChange={(e) => updateSettings({ promptTime: parseInt(e.target.value) })}
                    className="w-full accent-purple-600" />
                </div>
                <div>
                  <label className="flex justify-between text-sm font-medium text-gray-600 mb-1">
                    <span>Voting-Zeit</span>
                    <span className="font-bold text-purple-600">{settings.votingTime}s</span>
                  </label>
                  <input type="range" min="15" max="60" step="5" value={settings.votingTime}
                    onChange={(e) => updateSettings({ votingTime: parseInt(e.target.value) })}
                    className="w-full accent-purple-600" />
                </div>
              </div>
            </div>
          )}

          {/* Start Button */}
          {isHost && (
            <button
              onClick={startGame}
              disabled={playersList.length < 2}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-2xl font-black text-xl shadow-xl hover:opacity-90 disabled:opacity-40 transition"
            >
              {playersList.length < 2 ? 'Mindestens 2 Spielerinnen nötig' : 'Spiel starten!'}
            </button>
          )}

          {!isHost && (
            <div className="text-center text-white/80 text-sm py-4">
              Warten auf Spielstart durch die Spielleiterin...
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Creating Phase ────────────────────────────────────────────────────────
  if (phase === 'creating') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Header + Timer */}
          <div className="bg-white rounded-2xl shadow-xl p-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black text-gray-800">Prompt erstellen</h1>
              <p className="text-gray-500 text-sm">Beschreibe dein Bild</p>
            </div>
            <div className={`text-4xl font-black ${timeRemaining <= 10 ? 'text-red-500' : 'text-blue-600'}`}>
              {formatTime(timeRemaining)}
            </div>
          </div>

          {/* Thema */}
          {globalTopic && (
            <div className="bg-white rounded-2xl shadow-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Thema</div>
              <p className="text-gray-800 font-semibold text-base">{globalTopic}</p>
            </div>
          )}

          {/* Prompt-Eingabe (nur Spielerinnen) */}
          {isPlayer && (
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <label className="block text-sm font-semibold text-gray-600 mb-2">
                Dein Prompt (geheim – nur du siehst ihn jetzt)
              </label>
              <textarea
                value={myPrompt}
                onChange={(e) => setMyPrompt(e.target.value)}
                placeholder="Beschreibe das Bild, das du dir vorstellst..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-gray-800 h-28 resize-none"
                disabled={isGenerating}
              />
              <button
                onClick={generateImage}
                disabled={isGenerating || !myPrompt.trim()}
                className="mt-3 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-40 transition shadow"
              >
                {isGenerating ? 'Generiere Bild...' : 'Bild generieren'}
              </button>
              {myPlayer?.imageUrl && (
                <div className="mt-4">
                  <div className="text-xs text-green-600 font-semibold mb-2">Bild generiert!</div>
                  <img src={myPlayer.imageUrl} alt="Dein Bild" className="w-full rounded-xl object-cover h-64" />
                </div>
              )}
            </div>
          )}

          {/* Übersicht Bilder */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playersList.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl shadow-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-gray-800">{p.role === 'host' ? '👑' : '⚔️'} {p.name}</div>
                  {p.id === myPlayerId && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Du</span>}
                </div>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-full h-48 object-cover rounded-xl" />
                ) : (
                  <div className="w-full h-48 bg-gray-100 rounded-xl flex items-center justify-center">
                    <span className="text-gray-400 text-sm">Noch kein Bild...</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {myRole === 'spectator' && (
            <div className="text-center text-white/80 text-sm py-2">
              Du schaust zu – die Spielerinnen erstellen gerade ihre Bilder.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Voting Phase ──────────────────────────────────────────────────────────
  if (phase === 'voting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Header */}
          <div className="bg-white rounded-2xl shadow-xl p-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black text-gray-800">Abstimmung</h1>
              <p className="text-gray-500 text-sm">
                {myRole === 'spectator'
                  ? hasVoted ? 'Danke für deine Stimme!' : 'Wähle dein Lieblingsbild!'
                  : 'Nur Zuschauerinnen stimmen ab'}
              </p>
            </div>
            <div className={`text-4xl font-black ${timeRemaining <= 10 ? 'text-red-500' : 'text-green-600'}`}>
              {formatTime(timeRemaining)}
            </div>
          </div>

          {/* Bilder zum Voten */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playersList.map((p, i) => (
              <div
                key={p.id}
                onClick={() => myRole === 'spectator' && !hasVoted && vote(p.id)}
                className={`bg-white rounded-2xl shadow-xl p-4 transition-all ${
                  myRole === 'spectator' && !hasVoted
                    ? 'cursor-pointer hover:ring-4 hover:ring-green-400 hover:shadow-2xl'
                    : ''
                }`}
              >
                <div className="font-bold text-gray-600 mb-2 text-sm">
                  Bild {String.fromCharCode(65 + i)}
                </div>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={`Bild ${i + 1}`} className="w-full h-56 object-cover rounded-xl mb-3" />
                ) : (
                  <div className="w-full h-56 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
                    <span className="text-gray-400">Kein Bild</span>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-xl font-black text-gray-800">{p.votes} Stimmen</div>
                  {myRole === 'spectator' && !hasVoted && (
                    <button
                      onClick={(e) => { e.stopPropagation(); vote(p.id); }}
                      className="mt-2 bg-green-500 text-white px-6 py-2 rounded-full font-bold hover:bg-green-600 transition"
                    >
                      Abstimmen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {hasVoted && (
            <div className="text-center text-white text-lg font-bold py-2">
              Deine Stimme wurde gezählt!
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Results Phase ─────────────────────────────────────────────────────────
  if (phase === 'results') {
    const sorted = [...playersList].sort((a, b) => b.votes - a.votes);
    const maxVotes = sorted[0]?.votes || 0;
    const winners = sorted.filter((p) => p.votes === maxVotes && maxVotes > 0);
    const medals = ['🥇', '🥈', '🥉'];

    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-orange-400 to-pink-500 p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Sieger-Headline */}
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="text-6xl mb-3">{winners.length === 1 ? '🏆' : '🤝'}</div>
            <h1 className="text-4xl font-black text-gray-800 mb-2">
              {winners.length === 1 ? `${winners[0].name} gewinnt!` : 'Gleichstand!'}
            </h1>
            {winners.length > 1 && (
              <p className="text-xl text-gray-600">{winners.map((w) => w.name).join(' & ')}</p>
            )}
            <p className="text-gray-500 mt-1">{maxVotes > 0 ? `${maxVotes} Stimmen` : 'Keine Stimmen'}</p>
          </div>

          {/* Thema */}
          {globalTopic && (
            <div className="bg-white rounded-2xl shadow-xl p-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Thema war</div>
              <p className="text-gray-700 font-semibold">{globalTopic}</p>
            </div>
          )}

          {/* Rangliste */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((p, i) => {
              const isWinner = p.votes === maxVotes && maxVotes > 0;
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl shadow-xl p-4 ${
                    isWinner ? 'ring-4 ring-yellow-400' : ''
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="font-black text-2xl">{i < 3 ? medals[i] : `#${i + 1}`}</div>
                    <div className="font-black text-xl text-gray-800">{p.votes} Stimmen</div>
                  </div>
                  <div className="font-bold text-gray-800 mb-2">{p.name}</div>
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-48 object-cover rounded-xl mb-3" />
                  )}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Prompt</div>
                    <p className="text-gray-700 text-sm">{p.prompt || '—'}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {isHost && (
            <button
              onClick={resetGame}
              className="w-full bg-white text-purple-700 py-4 rounded-2xl font-black text-xl shadow-xl hover:bg-purple-50 transition"
            >
              Neues Spiel starten
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
