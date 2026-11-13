# Virtual Subbuteo 3D — FISTF Edition

Simulatore 3D di Subbuteo e Calcio da Tavolo basato su Three.js, fisica realistica delle basi semisferiche ed effetto Magnus, regolamento ufficiale FISTF V5.3, accessibilità completa e multiplayer LAN/Online.

## Download APK per Android (GitHub Releases)

Ogni modifica inviata sul branch `main` (o `master`, oppure tramite tag `v*`) attiva automaticamente il workflow GitHub Actions **Build & Release Android APK** (`.github/workflows/android-release.yml`), che:
1. Compila l'applicazione web (`npm run build`).
2. Sincronizza il progetto nativo Android con Capacitor (`npx cap sync android`).
3. Genera un **APK firmato e pronto per l'installazione** (`Virtual-Subbuteo-3D-vX.Y.Z.apk`).
4. Pubblica automaticamente una nuova **Release** nella sezione **Releases** del repository GitHub con l'APK allegato.

### Come installare sul telefono
1. Vai nella sezione **Releases** di questo repository su GitHub dal browser del tuo smartphone Android.
2. Scarica il file `.apk` dall'ultima release (`Assets`).
3. Apri il file scaricato per installare l'app.

### Firma persistente opzionale (aggiornamenti senza disinstallare)
Di default il workflow firma l'APK con un certificato generato automaticamente ad ogni build. Se desideri aggiornare l'app sul telefono mantenendo i dati senza disinstallare la versione precedente, aggiungi questi 4 **Repository Secrets** su GitHub (`Settings → Secrets and variables → Actions`):
- `ANDROID_KEYSTORE_BASE64` (file `.jks` codificato in base64)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Sviluppo Locale & Server Multiplayer LAN/Online

```bash
npm install
npm run dev
```

Il server avvia il client e il backend Socket.io sulla porta `3000`. Quando giochi dall'APK Android in modalità **LAN / Online**, apri la Lobby e inserisci l'indirizzo IP mostrato dal server (es. `http://192.168.1.50:3000`).
