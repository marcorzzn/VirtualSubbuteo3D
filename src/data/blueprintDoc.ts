export const BLUEPRINT_MANIFESTO_MD = `# Virtual Subbuteo — Blueprint e Manifesto (FISTF V5.3 Edition)

> **Versione:** 1.0 — Edizione Giocabile 3D + LAN/Online  
> **Ultimo aggiornamento:** 2026-10-27  
> **Standard Regolamentare:** FISTF Sport Rules V5.3 (1200×750 mm · Basi 22 mm · Palla 21 mm)  
> **Licenza proposta:** MIT per il codice, CC BY-SA 4.0 per la documentazione

---

## 1. Visione e Scopo
**Virtual Subbuteo 3D** traduce il calcio da tavolo fisico regolamentato dalla **FISTF** (Federation International of Sports Table Football) in una simulazione 3D accessibile via browser, con:
- **Prospettiva Multi-Camera (Ibrida FPS/Isometrica, Prima Persona Giocatore, Ortografica Isoperimetrica, TV Dinamica, Dietro la Porta, Libera 360°)**.
- **Fisica Realistica del Panno e delle Basi**: attrito del panno in feltro/baize, oscillazione armonica delle basi semisferiche appesantite, urti elastici base-palla e **Effetto Magnus** (curva laterale + topspin/backspin).
- **Regole FISTF V5.3**: Linea di tiro a 300 mm (gol valido solo dall'area di tiro), massimo 3 flick consecutivi per miniatura, Flick Difensivo di posizionamento (ispirato anche a *Subbuteo 1990* MS-DOS), falli di Back-Flick, rimesse laterali, calci d'angolo e rimesse dal fondo.
- **Multiplayer LAN e Online Real-Time**: server WebSocket/Socket.io integrato con stanze tramite codice rapido, sincronizzazione stato e modalità Pass & Play locale.
- **Accessibilità By Design**: navigazione completa da tastiera (\`Tab\` per ciclare le miniature, \`Frecce\` per mirare, pressione prolungata \`Spazio\` per caricare la potenza come nel classico del 1990), annunci vocali Screen Reader, modalità Alto Contrasto e Vista Tattica Testuale.

---

## 2. Specifiche Tecniche Ufficiali FISTF Implementate

| Parametro FISTF | Misura Reale | Scala Simulatore (1u = 10mm) | Regola Applicata |
| :--- | :--- | :--- | :--- |
| **Campo di Gioco** | 1200 mm × 750 mm | 120 × 75 unità | Panno verde con linee regolamentari |
| **Area di Tiro (Shooting Line)** | 300 mm dalla linea di fondo | \`x = ±30\` unità | Il gol è valido solo se la palla parte entro i 300 mm |
| **Area di Rigore** | 180 mm × 400 mm | 18 × 40 unità | Area d'azione del portiere |
| **Miniature (10 + 1 GK)** | Altezza 25 mm, Base Ø 22 mm | Raggio base 1.15 unità | Base semisferica con oscillazione fisica |
| **Pallone** | Diametro 21 mm | Raggio 1.05 unità | Fisica con Effetto Magnus e spin |
| **Limite Flick Miniatura** | Max 3 flick consecutivi | Contatore \`0/3\` su HUD | Alla 3ª spinta deve giocare un'altra miniatura |
| **Flick Difensivo** | 1 posizionamento per mossa | Fase dedicata pre-tiro | Fallo se il difensore tocca palla o avversario |

---

## 3. Opzioni di Visuale 3D
1. **Ibrida FPS / Isometrica (\`HYBRID\`)**: \`PerspectiveCamera\` con FOV ridotto (34°) e inclinazione a 45° — unisce profondità tridimensionale e lettura tattica del tavolo.
2. **Visuale Giocatore FPS (\`FPS_PLAYER\`)**: posizionata a livello del panno dietro le spalle della miniatura selezionata, puntata verso il pallone e la porta avversaria.
3. **Isoperimetrica / Ortografica (\`ISOMETRIC\`)**: proiezione parallela senza distorsione prospettica per calcolare linee di passaggio e blocchi difensivi al millimetro.
4. **Telecamera TV Dinamica (\`BROADCAST\`)**: segue fluidamente l'azione con smorzamento esponenziale.
5. **Visuale Porta (\`GOAL_CAM\`)**: inquadratura dietro la porta avversaria per tiri a giro nell'area dei 300 mm.
6. **Orbita Libera 360° (\`FREE_ORBIT\`)**: controllo completo di rotazione, pan e zoom attorno al tavolo da gioco.

---

## 4. Architettura Multiplayer (LAN & Online)
- **Pass & Play / LAN Locale sullo stesso dispositivo**: alternanza immediata tra Squadra Azzurri e Squadra Rossa per sfide da tavolo condivise.
- **Stanze LAN & Online via Socket.io (\`server.ts\`)**:
  - Creazione stanza con codice univoco (es. \`FISTF-ABCD\`) o ingresso immediato dalla Lobby Live.
  - Rilevamento automatico degli indirizzi IPv4 della rete locale (\`/api/network-info\`) per connettere PC, tablet e smartphone sulla stessa Wi-Fi/LAN.
  - Sincronizzazione deterministica dei flick (\`match:flick\`), dei posizionamenti difensivi e dello stato del campo (\`match:sync_state\`).
`;
