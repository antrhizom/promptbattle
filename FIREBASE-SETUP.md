# 🔥 Firebase Setup - Schritt für Schritt

Diese Anleitung zeigt dir **genau**, wie du Firebase für das Prompt Battle einrichtest.

## 📋 Übersicht

Du brauchst:
1. ✅ Firebase Projekt
2. ✅ Realtime Database
3. ✅ Firebase Config (API Keys)
4. ✅ Sicherheitsregeln

## 🚀 Schritt 1: Firebase Projekt erstellen

### 1.1 Firebase Console öffnen

1. Gehe zu https://console.firebase.google.com
2. Melde dich mit deinem Google-Konto an
3. Du siehst jetzt das Firebase-Dashboard

### 1.2 Neues Projekt erstellen

1. Klicke auf **"Projekt hinzufügen"** (oder **"Add project"** auf Englisch)
2. **Schritt 1 - Projekt-Name:**
   - Name: `prompt-battle` (oder ein anderer Name)
   - Klicke **"Weiter"**
3. **Schritt 2 - Google Analytics:**
   - Du kannst das deaktivieren (nicht notwendig)
   - Klicke **"Projekt erstellen"**
4. Warte 10-20 Sekunden
5. Klicke **"Weiter"** wenn fertig

🎉 Dein Firebase-Projekt ist jetzt erstellt!

## 🗄️ Schritt 2: Realtime Database aktivieren

### 2.1 Database erstellen

1. In der linken Sidebar, klicke auf **"Build"** (Erstellen)
2. Klicke auf **"Realtime Database"**
3. Klicke den Button **"Datenbank erstellen"** (Create Database)

### 2.2 Standort wählen

1. **Realtime Database-Standort:**
   - Wähle einen Standort (z.B. `europe-west1` für Europa)
   - Näher = schneller!
2. Klicke **"Weiter"**

### 2.3 Sicherheitsregeln wählen

1. Wähle **"Im Testmodus starten"** (Start in test mode)
   - Dies erlaubt jedem Lese- und Schreibzugriff
   - ⚠️ **Wichtig**: Nur für Entwicklung/Testing!
   - Für Production siehe Schritt 5
2. Klicke **"Aktivieren"** (Enable)

### 2.4 Überprüfen

Du solltest jetzt die Realtime Database sehen mit:
- Eine URL wie: `https://prompt-battle-xyz.firebaseio.com`
- Ein leerer Datenbaum mit `null`

✅ Realtime Database ist aktiv!

## 🔑 Schritt 3: Firebase Config holen

### 3.1 Projekteinstellungen öffnen

1. Klicke auf das **Zahnrad** ⚙️ oben links (neben "Projektübersicht")
2. Klicke **"Projekteinstellungen"** (Project settings)

### 3.2 Web-App registrieren

1. Scrolle runter zu **"Meine Apps"** (Your apps)
2. Klicke auf das **Web-Icon**: `</>` (HTML-Symbol)
3. **App-Spitzname**: `Prompt Battle` (oder beliebig)
4. ❌ **Firebase Hosting NICHT aktivieren** (nicht nötig)
5. Klicke **"App registrieren"** (Register app)

### 3.3 Config kopieren

Du siehst jetzt Code wie diesen:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "prompt-battle-xyz.firebaseapp.com",
  databaseURL: "https://prompt-battle-xyz.firebaseio.com",
  projectId: "prompt-battle-xyz",
  storageBucket: "prompt-battle-xyz.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxx"
};
```

**Kopiere diese Werte!** Du brauchst sie gleich.

### 3.4 .env.local erstellen

Erstelle eine Datei namens `.env.local` in deinem Projekt-Hauptverzeichnis:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=prompt-battle-xyz.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://prompt-battle-xyz.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=prompt-battle-xyz
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=prompt-battle-xyz.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:xxxxxxxxxxxxx
```

⚠️ **Ersetze die Werte** mit deinen eigenen aus der Firebase Console!

## 🧪 Schritt 4: Lokal testen

### 4.1 Dependencies installieren

```bash
npm install
```

### 4.2 Dev-Server starten

```bash
npm run dev
```

### 4.3 Öffnen

```
http://localhost:3000
```

### 4.4 Testen

1. Erstelle ein neues Spiel
2. Kopiere die Game-ID
3. Öffne ein zweites Browser-Fenster (oder Inkognito)
4. Trete mit der Game-ID bei
5. ✅ Beide Fenster sollten sich synchronisieren!

## 🔐 Schritt 5: Sicherheitsregeln (Production)

⚠️ Die Testmodus-Regeln laufen nach 30 Tagen ab!

### 5.1 Regeln öffnen

1. Firebase Console → **Realtime Database**
2. Klicke auf den Tab **"Regeln"** (Rules)

### 5.2 Basis-Regeln (erlaubt alles)

```json
{
  "rules": {
    "games": {
      "$gameId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Klicke **"Veröffentlichen"** (Publish)

### 5.3 Bessere Regeln (empfohlen)

```json
{
  "rules": {
    "games": {
      "$gameId": {
        ".read": true,
        ".validate": "newData.hasChildren(['phase', 'players', 'settings'])",
        
        "phase": {
          ".write": true,
          ".validate": "newData.isString()"
        },
        
        "timeRemaining": {
          ".write": true,
          ".validate": "newData.isNumber()"
        },
        
        "startTime": {
          ".write": "!data.exists()",
          ".validate": "newData.isNumber()"
        },
        
        "settings": {
          ".write": true,
          "promptTime": {
            ".validate": "newData.isNumber() && newData.val() >= 30 && newData.val() <= 300"
          },
          "votingTime": {
            ".validate": "newData.isNumber() && newData.val() >= 15 && newData.val() <= 60"
          }
        },
        
        "players": {
          "$playerId": {
            ".write": true,
            ".validate": "newData.hasChildren(['id', 'name'])",
            "name": {
              ".validate": "newData.isString() && newData.val().length <= 20"
            },
            "prompt": {
              ".validate": "newData.isString()"
            },
            "imageUrl": {
              ".validate": "newData.isString()"
            },
            "votes": {
              ".validate": "newData.isNumber() && newData.val() >= 0"
            }
          }
        }
      }
    }
  }
}
```

Diese Regeln:
- ✅ Erlauben Lesen für alle
- ✅ Erlauben Schreiben mit Validierung
- ✅ Begrenzen Spieler-Namen auf 20 Zeichen
- ✅ Validieren Zahlen-Werte
- ✅ Verhindern negative Votes

## 🌐 Schritt 6: Vercel Deployment

### 6.1 Environment Variables in Vercel

1. Gehe zu https://vercel.com
2. Wähle dein Projekt
3. Klicke **"Settings"** → **"Environment Variables"**

### 6.2 Variables hinzufügen

Füge **ALLE** diese hinzu (eine nach der anderen):

| Name | Wert | Environment |
|------|------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Dein API Key | Production, Preview, Development |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Dein Auth Domain | Production, Preview, Development |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Deine Database URL | Production, Preview, Development |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Deine Project ID | Production, Preview, Development |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Dein Storage Bucket | Production, Preview, Development |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Deine Sender ID | Production, Preview, Development |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Deine App ID | Production, Preview, Development |

### 6.3 Redeploy

1. Gehe zu **"Deployments"**
2. Klicke auf das **"..."** Menu beim letzten Deployment
3. Klicke **"Redeploy"**
4. Warte 1-2 Minuten

✅ Deine App ist jetzt live!

## 🔍 Daten in Firebase ansehen

### Während dem Spiel:

1. Gehe zur Firebase Console
2. Klicke **Realtime Database**
3. Du siehst alle Daten live aktualisieren!

```
games/
  └─ -N1234567890abcd/
      ├─ phase: "voting"
      ├─ timeRemaining: 25
      ├─ settings/
      │   ├─ promptTime: 120
      │   └─ votingTime: 30
      └─ players/
          ├─ player1/
          │   ├─ name: "Alice"
          │   ├─ prompt: "A cat on Mars"
          │   ├─ imageUrl: "https://..."
          │   └─ votes: 3
          └─ player2/
              ├─ name: "Bob"
              └─ ...
```

## 🐛 Häufige Probleme

### "Firebase not initialized"
→ Prüfe ob alle Environment Variables gesetzt sind
→ Prüfe ob du nach dem Setzen redeployed hast

### "Permission denied"
→ Prüfe Firebase Sicherheitsregeln
→ Stelle sicher dass `.read: true` und `.write: true` gesetzt ist

### "Database URL is not specified"
→ Stelle sicher dass `NEXT_PUBLIC_FIREBASE_DATABASE_URL` gesetzt ist
→ URL Format: `https://PROJEKT-ID.firebaseio.com`

### "Failed to connect to database"
→ Prüfe ob Realtime Database aktiviert ist
→ Prüfe Internet-Verbindung

## 📊 Firebase Nutzung überwachen

### Dashboard ansehen:

1. Firebase Console → **Realtime Database**
2. Tab **"Nutzung"** (Usage)
3. Du siehst:
   - Verbindungen
   - Gelesene Daten
   - Geschriebene Daten
   - Gespeicherte Daten

### Spark Plan (kostenlos):
- 1 GB gespeicherte Daten
- 10 GB pro Monat übertragene Daten
- 100 gleichzeitige Verbindungen

Für ein kleines Spiel ist das mehr als genug!

## 🎉 Fertig!

Du hast jetzt:
- ✅ Firebase Projekt
- ✅ Realtime Database
- ✅ Sichere Regeln
- ✅ Deployment mit Environment Variables
- ✅ Funktionierendes Multiplayer-Spiel!

Viel Spaß beim Spielen! 🚀
