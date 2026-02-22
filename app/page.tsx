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
    promptTime: 120,
    votingTime: 55,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [joinGameId, setJoinGameId] = useState('');
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

    const initialState: GameState = {
      phase: 'lobby',
      players: {},
      settings: { promptTime: 120, votingTime: 55 },
      timeRemaining: 0,
      startTime: Date.now(),
    };

    await set(newGameRef, initialState);
    setGameId(newGameId);

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

    await update(ref(database, `games/${gameId}`), {
      phase: 'creating',
      timeRemaining: settings.promptTime,
    });
  };

  const updateSettings = async (newSettings: Partial<GameSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    if (gameId) {
      await update(ref(database, `games/${gameId}/settings`), updated);
    }
  };

  // Automatisch Thema generieren wenn Kategorie gewählt
  const selectCategory = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    const topic = getRandomTopicForCategory(categoryId);
    setChallenge(topic);
    await update(ref(database, `games/${gameId}`), {
      challenge: topic,
      category: categoryId,
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getGameLink = () => {
    return `${window.location.origin}?game=${gameId}`;
  };

  const getShortGameId = () => {
    return gameId.slice(-8).toUpperCase();
  };

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
            <p className="text-center text-gray-600 mb-8">
              Game ID: <code className="bg-gray-100 px-2 py-1 rounded">{displayGameId}</code>
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
              onChange={(e) => setJoinGameId(e.target.value)}
              placeholder="Game-ID eingeben"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-800"
            />

            <button
              onClick={async () => {
                if (joinGameId.trim() && playerName.trim()) {
                  const success = await joinGame(joinGameId);
                  if (success) {
                    await joinAsPlayer(joinGameId);
                  } else {
                    alert('Spiel nicht gefunden!');
                  }
                }
              }}
              disabled={!joinGameId.trim() || !playerName.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
              Spiel beitreten (als Mitstreiterin)
            </button>

            <button
              onClick={async () => {
                if (joinGameId.trim()) {
                  const success = await joinGame(joinGameId);
                  if (success) {
                    await joinAsSpectator(joinGameId);
                  } else {
                    alert('Spiel nicht gefunden!');
                  }
                }
              }}
              disabled={!joinGameId.trim()}
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
              <button
                onClick={copyGameLink}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition text-sm"
              >
                📋 Link kopieren
              </button>
            </div>

            {/* QR-Code + Code – immer sichtbar */}
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-sm font-semibold text-gray-600 mb-3">Einladung teilen:</p>
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="flex-shrink-0">
                  <QRCodeSVG
                    value={getGameLink()}
                    size={140}
                    level="H"
                    includeMargin={true}
                  />
                  <p className="text-xs text-center text-gray-500 mt-1">QR-Code scannen</p>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <p className="text-xs text-gray-500 mb-1">Kurz-Code zum Eintippen:</p>
                  <div className="inline-block bg-purple-100 border-2 border-purple-300 rounded-xl px-6 py-3 mb-2">
                    <span className="text-3xl font-black tracking-widest text-purple-700">{getShortGameId()}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    → Auf <strong>promptbattle.vercel.app</strong> Game-ID eingeben
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Zuschauerinnen können auch während des Spiels noch beitreten!
                  </p>
                </div>
              </div>
            </div>

            {role === 'player' && (
              <div className="mb-8 p-6 bg-blue-50 rounded-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">Spieleinstellungen</h2>

                {/* Kategorie Auswahl – Thema wird automatisch zugeteilt */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    Wähle eine Kategorie – Thema wird automatisch zugeteilt:
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => selectCategory(cat.id)}
                        className={`p-4 rounded-lg border-2 transition text-left ${
                          selectedCategory === cat.id
                            ? 'border-purple-500 bg-purple-100'
                            : 'border-gray-300 bg-white hover:border-purple-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{cat.emoji}</span>
                          <div>
                            <div className="font-bold text-gray-800 text-sm">{cat.name}</div>
                            <div className="text-xs text-gray-600">{cat.description}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {challenge && (
                    <div className="p-4 bg-white rounded-lg border-2 border-purple-300">
                      <div className="font-bold text-purple-600 mb-1 text-sm">📋 Zugeteiltes Thema:</div>
                      <div className="text-gray-800">{challenge}</div>
                      <button
                        onClick={() => selectCategory(selectedCategory)}
                        className="mt-2 text-xs text-purple-500 hover:text-purple-700 transition"
                      >
                        Anderes Thema ziehen
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">
                      Prompt-Zeit (Sekunden): {settings.promptTime}
                    </label>
                    <input
                      type="range"
                      min="30"
                      max="300"
                      step="30"
                      value={settings.promptTime}
                      onChange={(e) =>
                        updateSettings({ promptTime: parseInt(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">
                      Voting-Zeit (Sekunden): {settings.votingTime}
                    </label>
                    <input
                      type="range"
                      min="15"
                      max="60"
                      step="5"
                      value={settings.votingTime}
                      onChange={(e) =>
                        updateSettings({ votingTime: parseInt(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                Teilnehmende ({playersList.length}/3)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {playersList.map((player) => (
                  <div
                    key={player.id}
                    className="p-4 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg"
                  >
                    <div className="text-lg font-semibold text-gray-800">{player.name}</div>
                    {player.id === myPlayerId && (
                      <div className="text-sm text-purple-600 font-medium">Das bist du!</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {role === 'player' && playersList.length >= 2 && (
              <button
                onClick={startGame}
                className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition"
              >
                Spiel starten!
              </button>
            )}

            {role === 'spectator' && (
              <div className="text-center text-gray-600">
                Warten auf Spielstart durch eine*n Teilnehmer*in...
              </div>
            )}

            {playersList.length < 2 && (
              <div className="text-center text-gray-600 mt-4">
                Mindestens 2 Teilnehmende benötigt zum Starten
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
