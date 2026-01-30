# 🎨 Prompt Battle Arena (mit Firebase Multiplayer)

Eine **echte Multiplayer** Prompt-Battle-Anwendung mit Firebase Realtime Database!

## ✨ Features

- ✅ **Echtes Multiplayer**: Mehrere Spieler können gleichzeitig spielen
- ✅ **Echtzeit-Synchronisation**: Alle Änderungen werden sofort bei allen angezeigt
- ✅ **Zuschauer-Modus**: Zuschauer sehen alle Prompts live
- ✅ **Private Prompts**: Spieler sehen nur ihre eigenen Prompts
- ✅ **Shared Settings**: Alle Spieler sehen und bearbeiten die Zeiteinstellungen
- ✅ **One-Vote-System**: Jeder kann nur einmal abstimmen
- ✅ **Game Links**: Teile einen Link, damit andere beitreten können
- ✅ **Live Updates**: Alles passiert in Echtzeit ohne Neuladen

## 🚀 Schnellstart (3 Schritte)

### 1️⃣ Firebase Projekt erstellen

1. Gehe zu https://console.firebase.google.com
2. Klicke auf **"Projekt hinzufügen"** / **"Add project"**
3. Projekt-Name: `prompt-battle` (oder beliebig)
4. **Google Analytics**: Kannst du deaktivieren
5. Klicke **"Projekt erstellen"**

### 2️⃣ Realtime Database aktivieren

1. Im Firebase-Projekt, klicke links auf **"Realtime Database"**
2. Klicke **"Datenbank erstellen"**
3. **Standort**: Wähle einen Server (z.B. `europe-west1`)
4. **Sicherheitsregeln**: Wähle **"Im Testmodus starten"**
   - ⚠️ Dies erlaubt jedem Lese- und Schreibzugriff
   - Für Production solltest du später Sicherheitsregeln hinzufügen
5. Klicke **"Aktivieren"**

### 3️⃣ Firebase Config kopieren

1. In der Firebase Console, klicke auf das **Zahnrad** ⚙️ → **"Projekteinstellungen"**
2. Scrolle runter zu **"Meine Apps"**
3. Klicke auf das **Web-Icon** `</>`
4. App-Name: `Prompt Battle`
5. Klicke **"App registrieren"**
6. Kopiere die **Firebase-Konfiguration** (die Werte in `firebaseConfig`)

## 📝 Installation & Deployment

### Option A: Direkt auf GitHub hochladen

1. **Entpacke die ZIP-Datei**
2. **Erstelle `.env.local` Datei** im Hauptverzeichnis:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=dein_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=dein_projekt.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://dein_projekt.firebaseio.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=dein_projekt_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=dein_projekt.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=deine_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=deine_app_id
   ```

3. **GitHub Repository erstellen**:
   - Gehe zu https://github.com/new
   - Repository Name: `prompt-battle`
   - Klicke **"Create repository"**

4. **Dateien hochladen**:
   - Klicke **"uploading an existing file"**
   - Ziehe ALLE Dateien (außer .env.local!) ins Fenster
   - Klicke **"Commit changes"**

5. **Auf Vercel deployen**:
   - Gehe zu https://vercel.com
   - Klicke **"Add New"** → **"Project"**
   - Importiere dein GitHub Repository
   - ⚠️ **WICHTIG**: Füge die Environment Variables hinzu:
     - Klicke **"Environment Variables"**
     - Füge alle `NEXT_PUBLIC_FIREBASE_*` Variablen hinzu
   - Klicke **"Deploy"**

### Option B: Mit Git (Terminal)

```bash
# 1. Entpacke die ZIP
unzip prompt-battle.zip
cd prompt-battle-firebase

# 2. Erstelle .env.local mit deinen Firebase-Werten

# 3. Git initialisieren
git init
git add .
git commit -m "Initial commit"

# 4. GitHub verbinden (ersetze USERNAME/REPO)
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main

# 5. Vercel CLI (optional)
npm install -g vercel
vercel
# Füge Environment Variables in Vercel hinzu!
```

## 🎮 So funktioniert das Spiel

### Als Spieler:
1. **Neues Spiel erstellen** oder **Game-ID eingeben**
2. In der Lobby: **Link kopieren** und an andere senden
3. Zeiteinstellungen anpassen (alle Spieler sehen das!)
4. Warten bis 2-3 Spieler bereit sind
5. **"Spiel starten"** klicken
6. OpenAI API Key eingeben (nur beim ersten Mal)
7. Prompt eingeben und **Bild generieren**
8. Andere sehen dein Bild, aber NICHT deinen Prompt
9. In der Voting-Phase: Für das beste Bild voten
10. Ergebnisse ansehen mit allen Prompts!

### Als Zuschauer:
1. Game-ID eingeben oder neues Spiel erstellen
2. **Alle Prompts live sehen** während Spieler tippen
3. Alle Bilder sehen
4. In der Voting-Phase abstimmen
5. Ergebnisse sehen

## 🔑 API Keys benötigt

### OpenAI API Key (Server-seitig):
- Gehe zu https://platform.openai.com/api-keys
- Erstelle einen Key
- Lade Guthaben auf (min. $5)
- **Kosten**: ~$0.04 pro DALL-E 3 Bild
- **Wichtig**: Dieser Key wird als Environment Variable gesetzt und von allen Spielern verwendet

### Firebase (kostenlos):
- Spark Plan ist kostenlos
- Genug für kleine bis mittlere Spiele
- Upgrade nur bei sehr vielen Spielern nötig

## 🔒 Wichtige Sicherheitseinstellungen

### Firebase Sicherheitsregeln (für Production):

1. Gehe zu Firebase Console → **Realtime Database** → **"Regeln"**
2. Ersetze die Regeln mit:

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

Für mehr Sicherheit (verhindert Spam/Missbrauch):

```json
{
  "rules": {
    "games": {
      "$gameId": {
        ".read": true,
        "players": {
          "$playerId": {
            ".write": "!data.exists() || data.child('id').val() === $playerId"
          }
        },
        "settings": {
          ".write": true
        },
        "phase": {
          ".write": true
        },
        "timeRemaining": {
          ".write": true
        }
      }
    }
  }
}
```

## 🌐 Environment Variables in Vercel

Gehe in Vercel zu deinem Projekt → **Settings** → **Environment Variables**:

Füge alle hinzu:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_OPENAI_API_KEY` ← **Dein OpenAI API Key**

⚠️ **WICHTIG**: Nach dem Hinzufügen musst du **"Redeploy"** klicken!

## 🎯 Wie es funktioniert

1. **Firebase Realtime Database** synchronisiert alle Daten in Echtzeit
2. Jedes Spiel hat eine eindeutige **Game ID**
3. Spieler können mit der Game ID beitreten
4. Alle Änderungen (Prompts, Bilder, Votes, Timer) werden sofort synchronisiert
5. Zuschauer sehen alles live

## 🐛 Troubleshooting

### "Firebase not defined"
→ Prüfe ob alle Environment Variables in Vercel gesetzt sind

### "Permission denied"
→ Prüfe Firebase Sicherheitsregeln (siehe oben)

### "Database URL not found"
→ Stelle sicher dass Realtime Database aktiviert ist

### Bilder werden nicht geladen
→ Prüfe OpenAI API Key und Guthaben

## 💰 Kosten

- **Firebase**: Kostenlos (Spark Plan)
- **Vercel**: Kostenlos (Hobby Plan)
- **GitHub**: Kostenlos
- **OpenAI**: ~$0.04 pro Bild

## 📚 Nächste Schritte

1. ✅ Firebase Projekt erstellen
2. ✅ Realtime Database aktivieren
3. ✅ Config kopieren
4. ✅ Auf GitHub hochladen
5. ✅ In Vercel deployen mit Environment Variables
6. 🎉 Spielen!

Viel Spaß! 🚀
