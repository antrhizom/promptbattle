'use client';

import { useState, useEffect, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, set, update, push, remove, get } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react';

type GamePhase = 'lobby' | 'creating' | 'voting' | 'results';
type Role = 'player' | 'spectator';

interface Player {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  votes: number;
  vielfalt?: number;
  treffend?: number;
  phantasie?: number;
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
  startTime: number;
  challenge?: string;
  category?: string;
  shortCode?: string;
}

// ─── Kurz-Code generieren: 3 Buchstaben + 2 Zahlen (z.B. "ABK42") ───────────
function generateShortCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne I und O (verwechslungsgefahr)
  const digits = '23456789'; // ohne 0 und 1
  let code = '';
  for (let i = 0; i < 3; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 2; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

// ─── Themen pro Kategorie ────────────────────────────────────────────────────
const CATEGORY_TOPICS: Record<string, string[]> = {
  betrieb: [
    'Ein Lernender erklärt einem Roboter, wie man eine Kaffeemaschine bedient',
    'Das Büro der Zukunft – aber niemand weiss, wie man den Drucker benutzt',
    'Eine Sitzung, in der alle gleichzeitig reden und niemand zuhört',
    'Der erste Arbeitstag: alles ist neu, alle sind freundlich, aber wo ist die Toilette?',
    'Ein Werkzeug, das plötzlich ein eigenes Leben hat',
  ],
  freizeit: [
    'Eine Gruppe Jugendlicher versucht, ohne Handy einen Abend zu überstehen',
    'Das perfekte Wochenende – aber das Wetter spielt nicht mit',
    'Ein Konzert, bei dem alle im falschen Film sind',
    'Eine Party, auf der alle gleichzeitig ein Selfie machen wollen',
    'Gaming-Turnier: der Controller streikt im entscheidenden Moment',
  ],
  familie: [
    'Sonntagsessen: drei Generationen, drei Meinungen, ein Tisch',
    'Der Familienausflug, der niemand so wollte wie geplant',
    'Grosseltern lernen ein neues Gerät kennen – mit Unterstützung der Enkelkinder',
    'Wohnzimmer-Fernsehabend: alle wollen etwas anderes schauen',
    'Der einzige ruhige Moment des Tages – um Mitternacht',
  ],
  jungsein: [
    'Träume von der Zukunft – aber erst nach dem Schlafen',
    'Zwischen Ausbildung, Freunde, Familie und Social Media: ein typischer Tag',
    'Das erste eigene Zimmer: endlich Freiheit, aber auch Verantwortung',
    'Wenn der Druck zu viel wird und man einfach mal Pause braucht',
    'Ein Moment, der zeigt: jung sein ist schön und kompliziert zugleich',
  ],
};

function getRandomTopicForCategory(categoryId: string): string {
  const topics = CATEGORY_TOPICS[categoryId] || CATEGORY_TOPICS['jungsein'];
  return topics[Math.floor(Math.random() * topics.length)];
}

export default function Home() {
  const [gameId, setGameId] = useState<string>('');
  const [role, setRole] = useState<Role | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [players, setPlayers] = useState<{ [id: string]: Player }>({});
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [myPrompt, setMyPrompt] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [settings, setSettings] = useState<GameSettings>({
    promptTime: 180,
    votingTime: 90,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [joinGameId, setJoinGameId] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [currentRatingPlayer, setCurrentRatingPlayer] = useState<string | null>(null);
  const [tempRatings, setTempRatings] = useState({ vielfalt: 0, treffend: 0, phantasie: 0 });
  const [ratedPlayers, setRatedPlayers] = useState<Set<string>>(new Set());
  const [totalGamesPlayed, setTotalGamesPlayed] = useState<number>(0);
  const [showRatingReminder, setShowRatingReminder] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const categories = [
    { id: 'betrieb', name: 'Betrieb & Ausbildung', emoji: '💼', description: 'Arbeit, Werkzeuge, Alltag im Betrieb' },
    { id: 'freizeit', name: 'Freizeit & Jugend', emoji: '🎮', description: 'Freunde, Handy, Wochenende' },
    { id: 'familie', name: 'Familie & Zuhause', emoji: '👨‍👩‍👧', description: 'Sonntag, Zuhause, Verwandte' },
    { id: 'jungsein', name: 'Jung sein heute', emoji: '⚡', description: 'Träume, Stress, Zukunft' },
  ];

  // Lade Gesamt-Anzahl gespielter Spiele
  useEffect(() => {
    const gamesRef = ref(database, 'games');
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      const gamesData = snapshot.val();
      if (gamesData) {
        const completedGames = Object.values(gamesData).filter(
          (game: any) => game.phase === 'results'
        ).length;
        setTotalGamesPlayed(completedGames);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firebase Listener für Game State
  useEffect(() => {
    if (!gameId) return;

    const gameRef = ref(database, `games/${gameId}`);

    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val() as GameState | null;
      if (data) {
        setPhase(data.phase);
        setPlayers(data.players || {});
        setSettings(data.settings);
        setTimeRemaining(data.timeRemaining || 0);
        if (data.challenge) setChallenge(data.challenge);
        if (data.category) setSelectedCategory(data.category);
        if (data.shortCode) setShortCode(data.shortCode);
      }
    });

    return () => unsubscribe();
  }, [gameId]);

  // Timer Management
  useEffect(() => {
    if (!gameId || role !== 'player' || Object.keys(players).length === 0) return;

    const playerIds = Object.keys(players).sort();
    const isTimerManager = playerIds[0] === myPlayerId;

    if (!isTimerManager) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (phase === 'creating' || phase === 'voting') {
      timerRef.current = setInterval(async () => {
        const gameRef = ref(database, `games/${gameId}`);
        const snapshot = await get(gameRef);
        const currentGame = snapshot.val() as GameState;

        if (!currentGame) return;

        if (phase === 'creating') {
          const allPlayers = Object.values(currentGame.players || {});
          const allPlayersReady = allPlayers.length > 0 && allPlayers.every(p => p.imageUrl);

          if (allPlayersReady) {
            await update(gameRef, {
              phase: 'voting',
              timeRemaining: settings.votingTime,
            });
            return;
          }
        }

        const newTimeRemaining = currentGame.timeRemaining - 1;

        if (newTimeRemaining <= 0) {
          if (phase === 'creating') {
            await update(gameRef, {
              phase: 'voting',
              timeRemaining: settings.votingTime,
            });
          } else if (phase === 'voting') {
            await update(gameRef, {
              phase: 'results',
              timeRemaining: 0,
            });
          }
        } else {
          await update(gameRef, { timeRemaining: newTimeRemaining });
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameId, phase, myPlayerId, players, role, settings]);

  const createNewGame = async () => {
    const newGameRef = push(ref(database, 'games'));
    const newGameId = newGameRef.key!;
    const code = generateShortCode();

    const initialState: GameState = {
      phase: 'lobby',
      players: {},
      settings: { promptTime: 180, votingTime: 90 },
      timeRemaining: 0,
      startTime: Date.now(),
      shortCode: code,
    };

    await set(newGameRef, initialState);
    setGameId(newGameId);
    setShortCode(code);

    return newGameId;
  };

  const joinGame = async (gId: string) => {
    const gameRef = ref(database, `games/${gId}`);
    const snapshot = await get(gameRef);

    if (snapshot.exists()) {
      setGameId(gId);
      return true;
    }
    return false;
  };

  // Spiel per Kurz-Code (z.B. "ABK42") suchen
  const findGameByShortCode = async (code: string): Promise<string | null> => {
    const snap = await get(ref(database, 'games'));
    if (!snap.exists()) return null;
    let found: string | null = null;
    snap.forEach((child) => {
      if (child.val()?.shortCode === code.toUpperCase()) {
        found = child.key;
      }
    });
    return found;
  };

  const joinAsPlayer = async (existingGameId?: string) => {
    if (!playerName.trim()) return;

    let gId = existingGameId || gameId;
    if (!gId) {
      gId = await createNewGame();
    }

    setGameId(gId);

    const playerCount = Object.keys(players).length;
    if (playerCount >= 3) {
      alert('Spiel ist voll! Maximal 3 Teilnehmende.');
      return;
    }

    const newPlayerId = push(ref(database, `games/${gId}/players`)).key!;

    const newPlayer: Player = {
      id: newPlayerId,
      name: playerName,
      prompt: '',
      imageUrl: '',
      votes: 0,
    };

    await set(ref(database, `games/${gId}/players/${newPlayerId}`), newPlayer);

    setMyPlayerId(newPlayerId);
    setRole('player');
  };

  const joinAsSpectator = async (existingGameId?: string) => {
    let gId = existingGameId || gameId;
    if (!gId) {
      gId = await createNewGame();
    }
    setGameId(gId);
    setRole('spectator');
  };

  const startGame = async () => {
    if (Object.keys(players).length < 2) return;

    // Thema vollständig zufällig zuteilen
    const allTopics = Object.values(CATEGORY_TOPICS).flat();
    const autoTopic = allTopics[Math.floor(Math.random() * allTopics.length)];

    await update(ref(database, `games/${gameId}`), {
      phase: 'creating',
      timeRemaining: settings.promptTime,
      challenge: autoTopic,
      category: '',
    });
  };

  const updateSettings = async (newSettings: Partial<GameSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    if (gameId) {
      await update(ref(database, `games/${gameId}/settings`), updated);
    }
  };

  // Nur Kategorie merken – Thema wird beim Spielstart automatisch gezogen
  const selectCategory = async (categoryId: string) => {
    // Toggle: nochmal klicken hebt Auswahl auf
    const newCat = selectedCategory === categoryId ? '' : categoryId;
    setSelectedCategory(newCat);
    setChallenge('');
    await update(ref(database, `games/${gameId}`), {
      category: newCat,
      challenge: '',
    });
  };

  const generateImage = async () => {
    if (!myPrompt.trim()) {
      alert('Bitte gib einen Prompt ein!');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: myPrompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'API Fehler');
      }

      const imageUrl = data.imageUrl;

      await update(ref(database, `games/${gameId}/players/${myPlayerId}`), {
        prompt: myPrompt,
        imageUrl: imageUrl,
      });

      alert('Bild erfolgreich generiert!');
    } catch (error: any) {
      alert(`Fehler beim Generieren: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const submitRating = async (playerId: string) => {
    if (phase !== 'voting') return;

    if (role === 'player') {
      alert('Teilnehmende können nicht voten! Nur Zuschauer*innen dürfen bewerten.');
      return;
    }

    if (tempRatings.vielfalt === 0 || tempRatings.treffend === 0 || tempRatings.phantasie === 0) {
      alert('Bitte bewerte alle 3 Kategorien!');
      return;
    }

    const totalPoints = tempRatings.vielfalt + (tempRatings.treffend * 2) + tempRatings.phantasie;

    const currentPlayer = players[playerId];

    await update(ref(database, `games/${gameId}/players/${playerId}`), {
      votes: (currentPlayer?.votes || 0) + totalPoints,
      vielfalt: (currentPlayer?.vielfalt || 0) + tempRatings.vielfalt,
      treffend: (currentPlayer?.treffend || 0) + tempRatings.treffend,
      phantasie: (currentPlayer?.phantasie || 0) + tempRatings.phantasie,
    });

    const newRatedPlayers = new Set(ratedPlayers);
    newRatedPlayers.add(playerId);
    setRatedPlayers(newRatedPlayers);

    const allPlayerIds = Object.keys(players);
    const allRated = allPlayerIds.every(id => newRatedPlayers.has(id));

    if (allRated) {
      setHasVoted(true);
      setShowRatingReminder(false);
    } else {
      setShowRatingReminder(true);
      setTimeout(() => setShowRatingReminder(false), 5000);
    }

    setCurrentRatingPlayer(null);
    setTempRatings({ vielfalt: 0, treffend: 0, phantasie: 0 });
  };

  const resetGame = async () => {
    if (!gameId) return;

    await update(ref(database, `games/${gameId}`), {
      phase: 'lobby',
      timeRemaining: 0,
      challenge: '',
      category: '',
    });

    const playersRef = ref(database, `games/${gameId}/players`);
    const snapshot = await get(playersRef);
    if (snapshot.exists()) {
      const updates: any = {};
      Object.keys(snapshot.val()).forEach(pId => {
        updates[`${pId}/prompt`] = '';
        updates[`${pId}/imageUrl`] = '';
        updates[`${pId}/votes`] = 0;
        updates[`${pId}/vielfalt`] = 0;
        updates[`${pId}/treffend`] = 0;
        updates[`${pId}/phantasie`] = 0;
      });
      await update(playersRef, updates);
    }

    setHasVoted(false);
    setMyPrompt('');
    setChallenge('');
    setSelectedCategory('');
    setRatedPlayers(new Set());
  };

  // ─── Kleine Beitritts-Leiste (für alle Spielphasen) ──────────────────────
  const JoinBar = () => (
    <div className="flex items-center gap-4 p-3 bg-white/95 border-2 border-purple-200 rounded-xl shadow mb-4">
      <div className="flex-shrink-0">
        <QRCodeSVG value={getGameLink()} size={72} level="H" includeMargin={false} />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-sm font-bold text-purple-700">promptbattle-nine.vercel.app</span>
        <span className="text-xl font-black tracking-widest text-purple-900 leading-tight">{getDisplayCode()}</span>
        <span className="text-xs text-gray-400">Zuschauerinnen können jederzeit beitreten</span>
      </div>
    </div>
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getGameLink = () => {
    return `https://promptbattle-nine.vercel.app?game=${gameId}`;
  };

  const getDisplayCode = () => shortCode || '…';

  const copyGameLink = () => {
    const link = getGameLink();
    navigator.clipboard.writeText(link);
    alert('Game-Link kopiert!');
  };

  // Check for game ID in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameIdFromUrl = urlParams.get('game');
    if (gameIdFromUrl && !gameId && !role) {
      setJoinGameId(gameIdFromUrl);
      joinGame(gameIdFromUrl).then((success) => {
        if (success) {
          setGameId(gameIdFromUrl);
        }
      });
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREENS
  // ═══════════════════════════════════════════════════════════════════════════

  if (!role) {
    // Einladungslink-Screen
    if (gameId || joinGameId) {
      const displayGameId = gameId || joinGameId;
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
            <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
              🎮 Du wurdest eingeladen!
            </h1>
            <p className="text-center text-gray-500 mb-8 text-sm">
              Du trittst einem laufenden Spiel bei
            </p>

            <div className="space-y-4">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Dein Name"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-800"
                maxLength={20}
              />

              <button
                onClick={async () => {
                  if (playerName.trim()) {
                    await joinAsPlayer(displayGameId);
                  }
                }}
                disabled={!playerName.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                Als Mitstreiterin beitreten
              </button>

              <button
                onClick={async () => {
                  await joinAsSpectator(displayGameId);
                }}
                className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition"
              >
                Als Zuschauerin beitreten
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Normaler Start-Screen
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
            🎨 Prompt Battle Arena
          </h1>

          {/* Spiel-Counter */}
          <div className="mb-6 p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg text-center">
            <p className="text-sm text-gray-600">Bisher gespielt</p>
            <p className="text-3xl font-bold text-purple-600">{totalGamesPlayed}</p>
            <p className="text-xs text-gray-500">abgeschlossene Spiele</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && playerName.trim() && (async () => { await createNewGame(); await joinAsPlayer(); })()}
              placeholder="Dein Name"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-800"
              maxLength={20}
            />

            <button
              onClick={async () => {
                if (playerName.trim()) {
                  await createNewGame();
                  await joinAsPlayer();
                }
              }}
              disabled={!playerName.trim()}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 transition"
            >
              Neues Spiel erstellen
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">oder per Code beitreten</span>
              </div>
            </div>

            <input
              type="text"
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="Code (z.B. ABK42)"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-800 text-center text-2xl font-black tracking-widest uppercase"
              maxLength={5}
            />

            <button
              onClick={async () => {
                if (joinGameId.trim() && playerName.trim()) {
                  const gId = await findGameByShortCode(joinGameId);
                  if (gId) {
                    await joinAsPlayer(gId);
                  } else {
                    alert('Spiel nicht gefunden! Prüfe den Code.');
                  }
                }
              }}
              disabled={joinGameId.length < 5 || !playerName.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
              Spiel beitreten (als Mitstreiterin)
            </button>

            <button
              onClick={async () => {
                if (joinGameId.trim()) {
                  const gId = await findGameByShortCode(joinGameId);
                  if (gId) {
                    await joinAsSpectator(gId);
                  } else {
                    alert('Spiel nicht gefunden! Prüfe den Code.');
                  }
                }
              }}
              disabled={joinGameId.length < 5}
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 disabled:bg-gray-400 transition"
            >
              Spiel beitreten (als Zuschauerin)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const playersList = Object.values(players);

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-4xl font-bold text-gray-800">Lobby</h1>
              <div className="text-sm text-gray-500">
                {playersList.length} / 3 Teilnehmende
              </div>
            </div>

            {/* QR-Code + Code – immer sichtbar, gross */}
            <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl">
              <p className="text-base font-bold text-gray-700 mb-4 text-center">📱 Einladung teilen</p>
              <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <QRCodeSVG
                    value={getGameLink()}
                    size={180}
                    level="H"
                    includeMargin={true}
                  />
                  <p className="text-sm text-gray-500 mt-2">QR-Code scannen</p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-gray-500">Code eintippen auf</p>
                  <p className="text-2xl font-black text-purple-700">promptbattle-nine.vercel.app</p>
                  <div className="bg-white border-4 border-purple-400 rounded-2xl px-8 py-4 shadow-md">
                    <span className="text-4xl font-black tracking-widest text-purple-700">{getDisplayCode()}</span>
                  </div>
                  <button
                    onClick={copyGameLink}
                    className="mt-1 bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 transition text-sm font-semibold"
                  >
                    📋 Link kopieren
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    Zuschauerinnen können auch während des Spiels beitreten
                  </p>
                </div>
              </div>
            </div>

            {/* Zeiten-Info */}
            <div className="mb-6 flex gap-4">
              <div className="flex-1 p-3 bg-purple-50 border border-purple-200 rounded-xl text-center">
                <div className="text-xs text-gray-500 mb-1">⏱ Prompt-Zeit</div>
                <div className="text-2xl font-black text-purple-700">3:00</div>
              </div>
              <div className="flex-1 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                <div className="text-xs text-gray-500 mb-1">⭐ Bewertungs-Zeit</div>
                <div className="text-2xl font-black text-green-700">1:30</div>
              </div>
            </div>

            {/* Teilnehmende */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 text-gray-800">
                Mitstreiterinnen
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {/* Belegte Slots */}
                {playersList.map((player) => (
                  <div
                    key={player.id}
                    className="p-4 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl text-center border-2 border-purple-200"
                  >
                    <div className="text-2xl mb-1">⚔️</div>
                    <div className="font-bold text-gray-800">{player.name}</div>
                    {player.id === myPlayerId && (
                      <div className="text-xs text-purple-600 font-medium mt-1">Das bist du!</div>
                    )}
                  </div>
                ))}
                {/* Freie Slots */}
                {Array.from({ length: Math.max(0, 3 - playersList.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="p-4 border-2 border-dashed border-gray-300 rounded-xl text-center text-gray-400"
                  >
                    <div className="text-2xl mb-1">⏳</div>
                    <div className="text-sm">Warte auf<br/>Mitspielerinnen...</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Start-Bereich */}
            {role === 'player' && playersList.length >= 2 && (
              <div className="space-y-3">
                <button
                  onClick={startGame}
                  className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition shadow"
                >
                  ▶ Spiel starten! ({playersList.length} Teilnehmende)
                </button>
                {playersList.length < 3 && (
                  <p className="text-center text-sm text-gray-500">
                    Oder noch auf eine dritte Person warten
                  </p>
                )}
              </div>
            )}

            {role === 'player' && playersList.length < 2 && (
              <div className="text-center py-4 text-gray-500">
                Warte auf mindestens eine weitere Mitstreiterin...
              </div>
            )}

            {role === 'spectator' && (
              <div className="text-center text-gray-600 py-4">
                Warten auf Spielstart durch eine Mitstreiterin...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Creating Phase ────────────────────────────────────────────────────────
  if (phase === 'creating') {
    const playersList = Object.values(players);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
        <div className="max-w-6xl mx-auto">
          <JoinBar />
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-3xl font-bold text-gray-800">
                🎨 Erstelle dein Bild!
              </h1>
              <div className="text-2xl font-bold text-purple-600">
                {formatTime(timeRemaining)}
              </div>
            </div>

            {challenge && (
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg border-2 border-purple-300">
                <div className="font-bold text-purple-600 mb-2">📋 Aufgabe:</div>
                <div className="text-gray-800 text-lg">{challenge}</div>
                <div className="text-sm text-gray-600 mt-2">
                  Kategorie: {categories.find(c => c.id === selectedCategory)?.emoji} {categories.find(c => c.id === selectedCategory)?.name}
                </div>
              </div>
            )}

            {role === 'player' && (
              <div className="mb-8 p-6 bg-purple-50 rounded-lg">
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Dein Prompt (nur du siehst diesen):
                </label>
                <textarea
                  value={myPrompt}
                  onChange={(e) => setMyPrompt(e.target.value)}
                  placeholder="Beschreibe dein Bild..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none mb-4 h-32 text-gray-800"
                  disabled={isGenerating}
                />
                <button
                  onClick={generateImage}
                  disabled={isGenerating || !myPrompt.trim()}
                  className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 transition"
                >
                  {isGenerating ? 'Generiere Bild...' : 'Bild generieren'}
                </button>
              </div>
            )}

            <h2 className="text-2xl font-semibold mb-4 text-gray-800">
              {role === 'spectator' ? 'Live Prompts der Teilnehmenden:' : 'Generierte Bilder:'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {playersList.map((player) => (
                <div
                  key={player.id}
                  className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg"
                >
                  <div className="font-bold text-lg mb-2 text-gray-800">{player.name}</div>

                  {role === 'spectator' && (
                    <div className="mb-2 p-2 bg-white rounded text-sm text-gray-700">
                      <strong>Prompt:</strong> {player.prompt || 'Noch kein Prompt...'}
                    </div>
                  )}

                  {player.imageUrl ? (
                    <img
                      src={player.imageUrl}
                      alt={`${player.name}'s creation`}
                      className="w-full h-64 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                      Wartet auf Bild...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Voting Phase ──────────────────────────────────────────────────────────
  if (phase === 'voting') {
    const playersList = Object.values(players);

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 p-4">
        <div className="max-w-6xl mx-auto">
          <JoinBar />
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800">
                ⭐ Zeit zum Bewerten!
              </h1>
              <div className="text-2xl font-bold text-green-600">
                {formatTime(timeRemaining)}
              </div>
            </div>

            {challenge && (
              <div className="mb-6 p-4 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg border-2 border-green-300">
                <div className="font-bold text-green-600 mb-2">📋 Aufgabe:</div>
                <div className="text-gray-800 text-lg">{challenge}</div>
              </div>
            )}

            {!hasVoted ? (
              <>
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-center text-lg text-gray-700 mb-2">
                    <strong>Bewerte ALLE {Object.keys(players).length} Bilder</strong> in 3 Kategorien (1-5 Sterne):
                  </p>
                  <p className="text-center text-sm text-purple-600 font-semibold mb-3">
                    ✅ {ratedPlayers.size} / {Object.keys(players).length} Bilder bewertet
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <strong>🎨 Vielfalt</strong>
                      <p className="text-xs text-gray-600">Verschiedene Elemente</p>
                    </div>
                    <div>
                      <strong>🎯 Treffend (x2)</strong>
                      <p className="text-xs text-gray-600">Passt zur Aufgabe</p>
                    </div>
                    <div>
                      <strong>💭 Phantasie</strong>
                      <p className="text-xs text-gray-600">Kreativ & originell</p>
                    </div>
                  </div>
                </div>

                {showRatingReminder && ratedPlayers.size < Object.keys(players).length && (
                  <div className="mb-4 p-4 bg-orange-100 border-2 border-orange-400 rounded-lg animate-pulse">
                    <p className="text-center text-lg font-bold text-orange-700">
                      ⚠️ Nicht vergessen!
                    </p>
                    <p className="text-center text-orange-600">
                      Du musst noch <strong>{Object.keys(players).length - ratedPlayers.size}</strong> weitere{Object.keys(players).length - ratedPlayers.size === 1 ? 's' : ''} Bild{Object.keys(players).length - ratedPlayers.size === 1 ? '' : 'er'} bewerten!
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-center text-lg mb-6 text-green-600 font-semibold">
                ✅ Danke für deine Bewertung!
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {playersList.map((player, index) => {
                const isCurrentRating = currentRatingPlayer === player.id;
                const isAlreadyRated = ratedPlayers.has(player.id);

                return (
                  <div
                    key={player.id}
                    className={`p-4 rounded-lg transition-all ${
                      hasVoted
                        ? 'bg-gray-100'
                        : isAlreadyRated
                        ? 'bg-gradient-to-br from-green-100 to-emerald-100 border-2 border-green-500'
                        : isCurrentRating
                        ? 'bg-gradient-to-br from-purple-100 to-blue-100 border-2 border-purple-500'
                        : 'bg-gradient-to-br from-green-50 to-blue-50 hover:shadow-xl'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold text-lg text-gray-800">
                        Bild {String.fromCharCode(65 + index)}
                      </div>
                      {isAlreadyRated && (
                        <div className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">
                          ✓ Bewertet
                        </div>
                      )}
                    </div>

                    {player.imageUrl ? (
                      <img
                        src={player.imageUrl}
                        alt={`Image ${index + 1}`}
                        className="w-full h-64 object-cover rounded-lg mb-3"
                      />
                    ) : (
                      <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 mb-3">
                        Kein Bild
                      </div>
                    )}

                    {!hasVoted && role === 'spectator' && (
                      <>
                        {!isCurrentRating ? (
                          <button
                            onClick={() => setCurrentRatingPlayer(player.id)}
                            disabled={isAlreadyRated}
                            className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition"
                          >
                            {isAlreadyRated ? '✓ Bewertet' : 'Bewerten'}
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-semibold text-gray-700 block mb-1">🎨 Vielfalt</label>
                              <div className="flex gap-1 justify-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    onClick={() => setTempRatings({ ...tempRatings, vielfalt: star })}
                                    className={`text-3xl transition-all hover:scale-110 ${star <= tempRatings.vielfalt ? 'text-yellow-400 drop-shadow-lg' : 'text-gray-300 hover:text-yellow-200'}`}
                                  >
                                    {star <= tempRatings.vielfalt ? '⭐' : '☆'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-gray-700 block mb-1">🎯 Treffend (zählt doppelt!)</label>
                              <div className="flex gap-1 justify-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    onClick={() => setTempRatings({ ...tempRatings, treffend: star })}
                                    className={`text-3xl transition-all hover:scale-110 ${star <= tempRatings.treffend ? 'text-yellow-400 drop-shadow-lg' : 'text-gray-300 hover:text-yellow-200'}`}
                                  >
                                    {star <= tempRatings.treffend ? '⭐' : '☆'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-gray-700 block mb-1">💭 Phantasie</label>
                              <div className="flex gap-1 justify-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    onClick={() => setTempRatings({ ...tempRatings, phantasie: star })}
                                    className={`text-3xl transition-all hover:scale-110 ${star <= tempRatings.phantasie ? 'text-yellow-400 drop-shadow-lg' : 'text-gray-300 hover:text-yellow-200'}`}
                                  >
                                    {star <= tempRatings.phantasie ? '⭐' : '☆'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="pt-2 border-t border-gray-200">
                              <p className="text-xs text-center text-gray-600 mb-2">
                                Gesamt: {tempRatings.vielfalt + (tempRatings.treffend * 2) + tempRatings.phantasie} Punkte
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setCurrentRatingPlayer(null);
                                    setTempRatings({ vielfalt: 0, treffend: 0, phantasie: 0 });
                                  }}
                                  className="flex-1 bg-gray-400 text-white py-2 rounded-lg font-semibold hover:bg-gray-500 transition text-sm"
                                >
                                  Abbrechen
                                </button>
                                <button
                                  onClick={() => submitRating(player.id)}
                                  disabled={tempRatings.vielfalt === 0 || tempRatings.treffend === 0 || tempRatings.phantasie === 0}
                                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition text-sm"
                                >
                                  Abschicken
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {role === 'player' && (
                      <div className="text-center text-sm text-gray-500 mt-2 italic">
                        Nur Zuschauerinnen bewerten
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Results Phase ─────────────────────────────────────────────────────────
  if (phase === 'results') {
    const playersList = Object.values(players).sort((a, b) => b.votes - a.votes);

    const playersWithRank = playersList.map((player, index) => {
      let rank = 1;
      for (let i = 0; i < index; i++) {
        if (playersList[i].votes > player.votes) {
          rank++;
        }
      }
      return { ...player, rank };
    });

    const winners = playersWithRank.filter(p => p.rank === 1);
    const maxVotes = playersList[0]?.votes || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-400 to-orange-500 p-4">
        <div className="max-w-6xl mx-auto">
          <JoinBar />
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
              🏆 Ergebnisse
            </h1>

            {challenge && (
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg text-center">
                <div className="font-bold text-purple-600 mb-2">📋 Aufgabe war:</div>
                <div className="text-gray-800">{challenge}</div>
              </div>
            )}

            <div className="mb-8 p-6 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-lg text-center">
              {winners.length === 1 ? (
                <>
                  <h2 className="text-3xl font-bold text-gray-800 mb-2">
                    Gewinnerin: {winners[0].name}! 🎉
                  </h2>
                  <p className="text-xl text-gray-700">mit {winners[0].votes} Punkten</p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-bold text-gray-800 mb-2">
                    🤝 Gleichstand!
                  </h2>
                  <p className="text-xl text-gray-700 mb-2">
                    {winners.map(w => w.name).join(', ')}
                  </p>
                  <p className="text-lg text-gray-600">jeweils mit {maxVotes} Punkten</p>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {playersWithRank.map((player) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = player.rank <= 3 ? medals[player.rank - 1] : '';

                return (
                  <div
                    key={player.id}
                    className={`p-4 rounded-lg ${
                      player.rank === 1
                        ? 'bg-gradient-to-br from-yellow-200 to-orange-200'
                        : player.rank === 2
                        ? 'bg-gradient-to-br from-gray-200 to-gray-300'
                        : player.rank === 3
                        ? 'bg-gradient-to-br from-orange-100 to-orange-200'
                        : 'bg-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold text-lg text-gray-800">
                        {medal && `${medal} `}{player.name}
                      </div>
                      <div className="font-bold text-xl text-gray-700">
                        {player.votes} Pkt.
                      </div>
                    </div>

                    <div className="text-center text-sm font-semibold text-gray-600 mb-3">
                      Platz {player.rank}
                    </div>

                    <div className="mb-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>🎨 Vielfalt:</span>
                        <span className="font-bold">{player.vielfalt || 0} ⭐</span>
                      </div>
                      <div className="flex justify-between">
                        <span>🎯 Treffend:</span>
                        <span className="font-bold">{player.treffend || 0} ⭐ (x2 = {(player.treffend || 0) * 2})</span>
                      </div>
                      <div className="flex justify-between">
                        <span>💭 Phantasie:</span>
                        <span className="font-bold">{player.phantasie || 0} ⭐</span>
                      </div>
                      <div className="border-t border-gray-300 mt-2 pt-2 flex justify-between font-bold text-purple-700">
                        <span>Gesamt:</span>
                        <span>{player.votes} Punkte</span>
                      </div>
                    </div>

                    <div className="mb-2 p-2 bg-white rounded text-sm text-gray-700 break-words">
                      <strong>Prompt:</strong> {player.prompt || 'Kein Prompt'}
                    </div>

                    {player.imageUrl && (
                      <img
                        src={player.imageUrl}
                        alt={`${player.name}'s creation`}
                        className="w-full h-64 object-cover rounded-lg"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {role === 'player' && (
              <button
                onClick={resetGame}
                className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition"
              >
                Neues Spiel starten
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
