import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  FileText,
  Globe,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { BLUEPRINT_MANIFESTO_MD } from './data/blueprintDoc';
import {
  ActiveFlickTracker,
  applyFlickToState,
  computeCpuFlickAction,
  createInitialBall,
  createInitialFigures,
  setupSetPiecePosition,
  stepSubbuteoPhysics,
} from './physics/subbuteoPhysics';
import { SubbuteoThreeController } from './three/SubbuteoScene';
import {
  AccessibilitySettings,
  AIDifficulty,
  BallState,
  CameraViewMode,
  FISTF_PITCH,
  FlickAction,
  FormationName,
  GameMode,
  MatchRulesLog,
  OnlineRoomSummary,
  PlayerFigure,
  SetPieceType,
  TeamId,
  TurnPhase,
} from './types/game';
import { soundEngine } from './utils/sound';

type ShellScreen = 'TITLE' | 'PLAYING' | 'PAUSED' | 'VICTORY';

const CAMERA_LABELS: Record<CameraViewMode, { short: string; desc: string; key: string }> = {
  [CameraViewMode.HYBRID]: {
    short: 'Ibrida FPS/Iso',
    desc: 'Prospettiva ibrida 45° FOV 33° tra immersività e tavolo tattico',
    key: '1',
  },
  [CameraViewMode.FPS_PLAYER]: {
    short: 'Giocatore FPS',
    desc: 'Dietro le spalle della miniatura selezionata a livello del panno',
    key: '2',
  },
  [CameraViewMode.ISOMETRIC]: {
    short: 'Isoperimetrica',
    desc: 'Proiezione ortografica parallela senza distorsione prospettica',
    key: '3',
  },
  [CameraViewMode.BROADCAST]: {
    short: 'TV Dinamica',
    desc: 'Inquadratura televisiva che segue il pallone con smorzamento fluido',
    key: '4',
  },
  [CameraViewMode.GOAL_CAM]: {
    short: 'Dietro Porta',
    desc: 'Visuale dall’area di tiro di 300 mm verso la porta avversaria',
    key: '5',
  },
  [CameraViewMode.FREE_ORBIT]: {
    short: 'Orbita 360°',
    desc: 'Esplorazione libera con mouse (trascina per ruotare, rotella per zoom)',
    key: '6',
  },
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneCtrlRef = useRef<SubbuteoThreeController | null>(null);

  // Shell & Modal states
  const [shellScreen, setShellScreen] = useState<ShellScreen>('TITLE');
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.CPU);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(AIDifficulty.CLUB);
  const [cameraMode, setCameraMode] = useState<CameraViewMode>(CameraViewMode.HYBRID);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeModal, setActiveModal] = useState<'NONE' | 'LOBBY' | 'BLUEPRINT' | 'ACCESSIBILITY'>('NONE');
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);

  // Match HUD reactive state
  const [scoreHome, setScoreHome] = useState(0);
  const [scoreAway, setScoreAway] = useState(0);
  const [half, setHalf] = useState<1 | 2>(1);
  const [matchClockSec, setMatchClockSec] = useState(15 * 60);
  const [turnTimerSec, setTurnTimerSec] = useState(FISTF_PITCH.TURN_DURATION_SEC);
  const [possession, setPossession] = useState<TeamId>('home');
  const [activeSubTurnTeam, setActiveSubTurnTeam] = useState<TeamId>('home');
  const [turnPhase, setTurnPhase] = useState<TurnPhase>(TurnPhase.ATTACK_SELECT);
  const [setPiece, setSetPiece] = useState<SetPieceType | null>('KICK_OFF');
  const [ruleBanner, setRuleBanner] = useState<string>(
    'Calcio d’inizio FISTF: Azzurri in possesso. Seleziona una miniatura e carica il Flick!'
  );
  const [rulesLog, setRulesLog] = useState<MatchRulesLog[]>([]);

  // Selection, Aim, Power & Spin
  const [selectedFigureId, setSelectedFigureId] = useState<string>('home_10');
  const [selectedFigureSummary, setSelectedFigureSummary] = useState<{
    name: string;
    number: number;
    team: TeamId;
    flicks: number;
  }>({ name: '10. Baggio', number: 10, team: 'home', flicks: 0 });
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [aimPower, setAimPower] = useState<number>(0.55);
  const [spinY, setSpinY] = useState<number>(0); // -1 right curl, +1 left curl
  const [spinForward, setSpinForward] = useState<number>(0); // -1 backspin, +1 topspin
  const [isChargingPower, setIsChargingPower] = useState<boolean>(false);
  const [homeFormation, setHomeFormation] = useState<FormationName>('4-3-3');

  // Accessibility settings
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    highContrast: false,
    reducedMotion: false,
    screenReaderAnnouncements: false,
    textTacticalOverlay: false,
    soundEnabled: true,
    hudScale: 'normal',
    showTrajectoryGuide: true,
  });

  // Multiplayer LAN & Online state
  const socketRef = useRef<Socket | null>(null);
  const [onlineRooms, setOnlineRooms] = useState<OnlineRoomSummary[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [myOnlineRole, setMyOnlineRole] = useState<'home' | 'away' | 'spectator'>('home');
  const [playerNameInput, setPlayerNameInput] = useState('Capitano FISTF');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomHostName, setRoomHostName] = useState('Azzurri');
  const [roomGuestName, setRoomGuestName] = useState<string | null>(null);
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Mutable simulation refs (accessed at 60fps inside the loop without re-creating the canvas)
  const figuresRef = useRef<PlayerFigure[]>(createInitialFigures('4-3-3', '4-3-3'));
  const ballRef = useRef<BallState>(createInitialBall());
  const trackerRef = useRef<ActiveFlickTracker | null>(null);
  const shellScreenRef = useRef<ShellScreen>('TITLE');
  const gameModeRef = useRef<GameMode>(GameMode.CPU);
  const aiDifficultyRef = useRef<AIDifficulty>(AIDifficulty.CLUB);
  const possessionRef = useRef<TeamId>('home');
  const activeSubTurnRef = useRef<TeamId>('home');
  const turnPhaseRef = useRef<TurnPhase>(TurnPhase.ATTACK_SELECT);
  const selectedFigureIdRef = useRef<string>('home_10');
  const aimAngleRef = useRef<number>(0);
  const aimPowerRef = useRef<number>(0.55);
  const spinYRef = useRef<number>(0);
  const spinForwardRef = useRef<number>(0);
  const isChargingRef = useRef<boolean>(false);
  const chargeDirRef = useRef<number>(1);
  const accessibilityRef = useRef<AccessibilitySettings>(accessibility);
  const scoreHomeRef = useRef<number>(0);
  const scoreAwayRef = useRef<number>(0);
  const currentRoomIdRef = useRef<string | null>(null);
  const myOnlineRoleRef = useRef<'home' | 'away' | 'spectator'>('home');

  // Keep refs synced
  useEffect(() => {
    shellScreenRef.current = shellScreen;
    sceneCtrlRef.current?.setTitleScreenOrbit(shellScreen === 'TITLE');
  }, [shellScreen]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  useEffect(() => {
    aiDifficultyRef.current = aiDifficulty;
  }, [aiDifficulty]);

  useEffect(() => {
    accessibilityRef.current = accessibility;
    soundEngine.enabled = accessibility.soundEnabled;
    soundEngine.voiceAnnouncements = accessibility.screenReaderAnnouncements;
    sceneCtrlRef.current?.setHighContrastPitch(accessibility.highContrast);
  }, [accessibility]);

  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
  }, [currentRoomId]);

  useEffect(() => {
    myOnlineRoleRef.current = myOnlineRole;
  }, [myOnlineRole]);

  const appendRuleLog = useCallback(
    (title: string, detail: string, type: MatchRulesLog['type'] = 'info') => {
      const now = new Date();
      const timestamp = now.toTimeString().slice(0, 8);
      setRuleBanner(`${title}: ${detail}`);
      setRulesLog((prev) => [{ id: `${Date.now()}_${Math.random()}`, timestamp, title, detail, type }, ...prev.slice(0, 14)]);
      soundEngine.announce(`${title}. ${detail}`);
    },
    []
  );

  const selectFigureById = useCallback((figId: string, autoAimAtBall = true) => {
    const fig = figuresRef.current.find((f) => f.id === figId);
    if (!fig) return;

    // In normal play, only allow selecting a figure belonging to the active sub-turn team
    if (
      gameModeRef.current !== GameMode.TRAINING &&
      fig.team !== activeSubTurnRef.current
    ) {
      return;
    }

    // In Online mode, only allow selecting your own team
    if (
      gameModeRef.current === GameMode.ONLINE &&
      fig.team !== myOnlineRoleRef.current
    ) {
      return;
    }

    selectedFigureIdRef.current = fig.id;
    setSelectedFigureId(fig.id);
    setSelectedFigureSummary({
      name: fig.name,
      number: fig.number,
      team: fig.team,
      flicks: fig.flickCount,
    });

    if (autoAimAtBall) {
      const b = ballRef.current;
      const angleToBall = Math.atan2(b.z - fig.z, b.x - fig.x);
      aimAngleRef.current = angleToBall;
      setAimAngle(angleToBall);
    }
  }, []);

  // Broadcast state snapshot to online opponent if host or active turn
  const broadcastOnlineState = useCallback(() => {
    if (gameModeRef.current !== GameMode.ONLINE || !currentRoomIdRef.current || !socketRef.current) return;
    socketRef.current.emit('match:sync_state', {
      roomId: currentRoomIdRef.current,
      state: {
        figures: figuresRef.current,
        ball: ballRef.current,
        possession: possessionRef.current,
        activeSubTurnTeam: activeSubTurnRef.current,
        phase: turnPhaseRef.current,
        scoreHome: scoreHomeRef.current,
        scoreAway: scoreAwayRef.current,
      },
    });
  }, []);

  // Execute a Flick Action (from local user, AI, or remote socket)
  const triggerFlickAction = useCallback(
    (action: FlickAction, isRemote = false) => {
      if (turnPhaseRef.current === TurnPhase.SIMULATING) return;

      const fig = figuresRef.current.find((f) => f.id === action.figureId);
      if (!fig) return;

      // Enforce FISTF 3-consecutive-flick limit for attacking figures
      if (!action.isDefensiveFlick && fig.flickCount >= FISTF_PITCH.MAX_FIGURE_FLICKS && gameModeRef.current !== GameMode.TRAINING) {
        appendRuleLog(
          'Limite 3 Flick FISTF',
          `La miniatura #${fig.number} ha già effettuato 3 flick consecutivi! Scegli un altro giocatore.`,
          'foul'
        );
        return;
      }

      if (!isRemote && gameModeRef.current === GameMode.ONLINE && currentRoomIdRef.current && socketRef.current) {
        socketRef.current.emit('match:flick', {
          roomId: currentRoomIdRef.current,
          eventId: `${Date.now()}_${Math.random()}`,
          action,
        });
      }

      trackerRef.current = applyFlickToState(figuresRef.current, ballRef.current, action);
      turnPhaseRef.current = TurnPhase.SIMULATING;
      setTurnPhase(TurnPhase.SIMULATING);
      setSetPiece(null);

      setSelectedFigureSummary({
        name: fig.name,
        number: fig.number,
        team: fig.team,
        flicks: fig.flickCount,
      });
    },
    [appendRuleLog]
  );

  // Skip defensive positioning flick
  const skipDefensiveFlick = useCallback((isRemote = false) => {
    if (turnPhaseRef.current !== TurnPhase.DEFENSE_POSITION) return;

    if (!isRemote && gameModeRef.current === GameMode.ONLINE && currentRoomIdRef.current && socketRef.current) {
      socketRef.current.emit('match:skip_defense', {
        roomId: currentRoomIdRef.current,
        eventId: `${Date.now()}_${Math.random()}`,
      });
    }

    turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
    setTurnPhase(TurnPhase.ATTACK_SELECT);
    activeSubTurnRef.current = possessionRef.current;
    setActiveSubTurnTeam(possessionRef.current);
    setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);

    // Auto-select closest eligible attacker to the ball
    const attackers = figuresRef.current.filter(
      (f) => f.team === possessionRef.current && f.flickCount < FISTF_PITCH.MAX_FIGURE_FLICKS
    );
    if (attackers.length > 0) {
      const b = ballRef.current;
      attackers.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
      selectFigureById(attackers[0].id, true);
    }
  }, [selectFigureById]);

  // Reset / Start Match
  const resetMatch = useCallback(
    (formation: FormationName = homeFormation, startImmediately = true) => {
      figuresRef.current = createInitialFigures(formation, '4-3-3');
      ballRef.current = createInitialBall();
      trackerRef.current = null;

      scoreHomeRef.current = 0;
      scoreAwayRef.current = 0;
      setScoreHome(0);
      setScoreAway(0);
      setHalf(1);
      setMatchClockSec(15 * 60);
      setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);

      possessionRef.current = 'home';
      activeSubTurnRef.current = 'home';
      turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
      setPossession('home');
      setActiveSubTurnTeam('home');
      setTurnPhase(TurnPhase.ATTACK_SELECT);
      setSetPiece('KICK_OFF');

      selectFigureById('home_10', true);
      soundEngine.playWhistle('short');

      appendRuleLog(
        'Fischio d’Inizio FISTF',
        'Campo regolamentare 1200×750mm. Ricorda: il gol è valido solo se la palla si trova entro la linea di tiro dei 300mm!',
        'info'
      );

      if (startImmediately) {
        setShellScreen('PLAYING');
      }
    },
    [appendRuleLog, homeFormation, selectFigureById]
  );

  // Initialize Socket.io & fetch local LAN IP addresses
  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.lanAddresses)) {
          setLanAddresses(data.lanAddresses);
        }
      })
      .catch(() => {});

    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('lobby:rooms_updated', (rooms: OnlineRoomSummary[]) => {
      setOnlineRooms(rooms);
    });

    socket.on(
      'room:joined',
      (info: { roomId: string; roomName: string; hostName: string; guestName: string | null; status: string }) => {
        setRoomHostName(info.hostName);
        setRoomGuestName(info.guestName);
        if (info.guestName) {
          appendRuleLog(
            'Tavolo Multiplayer Attivo',
            `${info.hostName} (Azzurri) vs ${info.guestName} (Rossi) connessi nella stanza ${info.roomId}!`,
            'info'
          );
        }
      }
    );

    socket.on('match:remote_flick', (action: FlickAction) => {
      triggerFlickAction(action, true);
    });

    socket.on('match:remote_skip_defense', () => {
      skipDefensiveFlick(true);
    });

    socket.on(
      'match:remote_sync_state',
      (state: {
        figures?: PlayerFigure[];
        ball?: BallState;
        possession?: TeamId;
        activeSubTurnTeam?: TeamId;
        phase?: TurnPhase;
        scoreHome?: number;
        scoreAway?: number;
      }) => {
        if (turnPhaseRef.current === TurnPhase.SIMULATING) return;
        if (state.figures) figuresRef.current = state.figures;
        if (state.ball) ballRef.current = state.ball;
        if (state.possession) {
          possessionRef.current = state.possession;
          setPossession(state.possession);
        }
        if (state.activeSubTurnTeam) {
          activeSubTurnRef.current = state.activeSubTurnTeam;
          setActiveSubTurnTeam(state.activeSubTurnTeam);
        }
        if (state.phase) {
          turnPhaseRef.current = state.phase;
          setTurnPhase(state.phase);
        }
        if (typeof state.scoreHome === 'number') {
          scoreHomeRef.current = state.scoreHome;
          setScoreHome(state.scoreHome);
        }
        if (typeof state.scoreAway === 'number') {
          scoreAwayRef.current = state.scoreAway;
          setScoreAway(state.scoreAway);
        }
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [appendRuleLog, skipDefensiveFlick, triggerFlickAction]);

  // Trigger AI decisions when it is CPU's sub-turn
  useEffect(() => {
    if (shellScreen !== 'PLAYING' || gameMode !== GameMode.CPU) return;
    if (turnPhase !== TurnPhase.ATTACK_SELECT && turnPhase !== TurnPhase.DEFENSE_POSITION) return;
    if (activeSubTurnTeam !== 'away') return;

    const timer = window.setTimeout(() => {
      if (shellScreenRef.current !== 'PLAYING' || activeSubTurnRef.current !== 'away') return;
      const isDef = turnPhaseRef.current === TurnPhase.DEFENSE_POSITION;
      const cpuAction = computeCpuFlickAction(
        figuresRef.current,
        ballRef.current,
        'away',
        isDef,
        aiDifficultyRef.current
      );
      selectFigureById(cpuAction.figureId, false);
      triggerFlickAction(cpuAction, false);
    }, 680);

    return () => window.clearTimeout(timer);
  }, [activeSubTurnTeam, gameMode, selectFigureById, shellScreen, triggerFlickAction, turnPhase]);

  // Match & 30s Shot Clock Timer
  useEffect(() => {
    if (shellScreen !== 'PLAYING' || gameMode === GameMode.TRAINING) return;

    const interval = window.setInterval(() => {
      setMatchClockSec((prev) => {
        if (prev <= 1) {
          if (half === 1) {
            setHalf(2);
            soundEngine.playWhistle('long');
            appendRuleLog('Inizio Secondo Tempo', 'Secondo tempo FISTF (15 minuti).', 'info');
            return 15 * 60;
          } else {
            soundEngine.playWhistle('long');
            setShellScreen('VICTORY');
            return 0;
          }
        }
        return prev - 1;
      });

      if (turnPhaseRef.current === TurnPhase.ATTACK_SELECT || turnPhaseRef.current === TurnPhase.DEFENSE_POSITION) {
        setTurnTimerSec((prev) => {
          if (prev <= 1) {
            // 30s timeout: switch turn or skip defense
            if (turnPhaseRef.current === TurnPhase.DEFENSE_POSITION) {
              skipDefensiveFlick(false);
            } else {
              const nextTeam: TeamId = possessionRef.current === 'home' ? 'away' : 'home';
              possessionRef.current = nextTeam;
              activeSubTurnRef.current = nextTeam;
              setPossession(nextTeam);
              setActiveSubTurnTeam(nextTeam);
              soundEngine.playWhistle('short');
              appendRuleLog(
                'Scaduti i 30 Secondi FISTF',
                `Tempo per la mossa esaurito! Il possesso passa a ${nextTeam === 'home' ? 'Azzurri' : 'Rossi'}.`,
                'foul'
              );
            }
            return FISTF_PITCH.TURN_DURATION_SEC;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [appendRuleLog, gameMode, half, shellScreen, skipDefensiveFlick]);

  // Initialize Three.js WebGL Viewport & 60fps Simulation Loop (with Software WebGL Guard)
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const ctrl = new SubbuteoThreeController(container, {
      onSelectFigure: (figureId) => {
        selectFigureById(figureId, true);
      },
      onAimChange: (angle, dragPower) => {
        aimAngleRef.current = angle;
        setAimAngle(angle);
        if (typeof dragPower === 'number') {
          aimPowerRef.current = dragPower;
          setAimPower(dragPower);
        }
      },
      onExecuteFlick: (angle, power) => {
        triggerFlickAction({
          figureId: selectedFigureIdRef.current,
          team: activeSubTurnRef.current,
          angle,
          power,
          spinY: spinYRef.current,
          spinForward: spinForwardRef.current,
          isDefensiveFlick: turnPhaseRef.current === TurnPhase.DEFENSE_POSITION,
        });
      },
    });
    sceneCtrlRef.current = ctrl;

    let frameId = 0;
    let lastTime = performance.now();
    const isSoftwareGl = ctrl.getIsSoftwareGl();

    function afterDraw(cb: () => void) {
      const gl = ctrl.getRendererContext();
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      // Update power bar if holding Spacebar / Charge button (Subbuteo 1990 pattern)
      if (isChargingRef.current) {
        let nextP = aimPowerRef.current + chargeDirRef.current * dt * 1.15;
        if (nextP >= 1.0) {
          nextP = 1.0;
          chargeDirRef.current = -1;
        } else if (nextP <= 0.1) {
          nextP = 0.1;
          chargeDirRef.current = 1;
        }
        aimPowerRef.current = nextP;
        setAimPower(nextP);
      }

      // Advance Subbuteo Physics
      const outcome = stepSubbuteoPhysics(
        figuresRef.current,
        ballRef.current,
        trackerRef.current,
        dt
      );

      if (turnPhaseRef.current === TurnPhase.SIMULATING && outcome.settled) {
        const tr = trackerRef.current;
        trackerRef.current = null;

        if (outcome.goalScoredBy) {
          soundEngine.playGoalHorn();
          if (outcome.goalScoredBy === 'home') {
            scoreHomeRef.current += 1;
            setScoreHome(scoreHomeRef.current);
          } else {
            scoreAwayRef.current += 1;
            setScoreAway(scoreAwayRef.current);
          }
          const scorerTeamName = outcome.goalScoredBy === 'home' ? 'AZZURRI' : 'ROSSI';
          appendRuleLog(
            `GOL REGOLARE ${scorerTeamName}!`,
            `Tiro scoccato regolarmente dall'interno dell'area di tiro dei 300mm! Punteggio ${scoreHomeRef.current} - ${scoreAwayRef.current}.`,
            'goal'
          );

          // Reset to center for Kick-off by conceding team
          const concedingTeam: TeamId = outcome.goalScoredBy === 'home' ? 'away' : 'home';
          figuresRef.current = createInitialFigures('4-3-3', '4-3-3');
          ballRef.current = createInitialBall();
          possessionRef.current = concedingTeam;
          activeSubTurnRef.current = concedingTeam;
          turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
          setPossession(concedingTeam);
          setActiveSubTurnTeam(concedingTeam);
          setTurnPhase(TurnPhase.ATTACK_SELECT);
          setSetPiece('KICK_OFF');
          setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);
          selectFigureById(`${concedingTeam}_10`, true);
          broadcastOnlineState();
        } else if (outcome.disallowedGoalOutsideShootingArea && outcome.outOfBounds) {
          soundEngine.playWhistle('long');
          appendRuleLog(
            'GOL ANNULLATO (Regola 300mm FISTF)',
            'Il pallone si trovava fuori dalla linea di tiro dei 300mm al momento del tocco! Rimessa dal fondo avversaria.',
            'foul'
          );
          const ob = outcome.outOfBounds;
          const takerId = setupSetPiecePosition(
            figuresRef.current,
            ballRef.current,
            ob.awardedTo,
            ob.restartX,
            ob.restartZ,
            ob.type
          );
          possessionRef.current = ob.awardedTo;
          activeSubTurnRef.current = ob.awardedTo;
          turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
          setPossession(ob.awardedTo);
          setActiveSubTurnTeam(ob.awardedTo);
          setTurnPhase(TurnPhase.ATTACK_SELECT);
          setSetPiece(ob.type);
          setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);
          selectFigureById(takerId, true);
          broadcastOnlineState();
        } else if (outcome.outOfBounds) {
          soundEngine.playWhistle('short');
          const ob = outcome.outOfBounds;
          const labelMap: Record<SetPieceType, string> = {
            KICK_OFF: 'Calcio d’Inizio',
            THROW_IN: 'Rimessa Laterale FISTF',
            CORNER_KICK: 'Calcio d’Angolo FISTF',
            GOAL_KICK: 'Rimessa dal Fondo FISTF',
            FREE_KICK: 'Calcio di Punizione FISTF',
            PENALTY: 'Calcio di Rigore FISTF',
          };
          const takerId = setupSetPiecePosition(
            figuresRef.current,
            ballRef.current,
            ob.awardedTo,
            ob.restartX,
            ob.restartZ,
            ob.type
          );
          possessionRef.current = ob.awardedTo;
          activeSubTurnRef.current = ob.awardedTo;
          turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
          setPossession(ob.awardedTo);
          setActiveSubTurnTeam(ob.awardedTo);
          setTurnPhase(TurnPhase.ATTACK_SELECT);
          setSetPiece(ob.type);
          setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);
          selectFigureById(takerId, true);
          appendRuleLog(
            labelMap[ob.type],
            `Palla fuori: ripresa assegnata a ${ob.awardedTo === 'home' ? 'Azzurri' : 'Rossi'}.`,
            'setpiece'
          );
          broadcastOnlineState();
        } else if (outcome.foulCommitted && tr) {
          soundEngine.playWhistle('short');
          const awardedTo: TeamId = tr.flickedTeam === 'home' ? 'away' : 'home';
          possessionRef.current = awardedTo;
          activeSubTurnRef.current = awardedTo;
          turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
          setPossession(awardedTo);
          setActiveSubTurnTeam(awardedTo);
          setTurnPhase(TurnPhase.ATTACK_SELECT);
          setSetPiece('FREE_KICK');
          setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);
          appendRuleLog('Fallo Regolamento FISTF', outcome.foulCommitted, 'foul');

          const candidates = figuresRef.current.filter((f) => f.team === awardedTo);
          candidates.sort(
            (a, b) =>
              Math.hypot(a.x - ballRef.current.x, a.z - ballRef.current.z) -
              Math.hypot(b.x - ballRef.current.x, b.z - ballRef.current.z)
          );
          if (candidates[0]) selectFigureById(candidates[0].id, true);
          broadcastOnlineState();
        } else if (tr) {
          // Normal flick resolution (FISTF + Subbuteo 1990 turn logic)
          if (tr.isDefensiveFlick) {
            // Defensive flick completed cleanly -> return sub-turn to Attacking team
            activeSubTurnRef.current = possessionRef.current;
            turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
            setActiveSubTurnTeam(possessionRef.current);
            setTurnPhase(TurnPhase.ATTACK_SELECT);
            setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);

            const attackers = figuresRef.current.filter(
              (f) => f.team === possessionRef.current && f.flickCount < FISTF_PITCH.MAX_FIGURE_FLICKS
            );
            attackers.sort(
              (a, b) =>
                Math.hypot(a.x - ballRef.current.x, a.z - ballRef.current.z) -
                Math.hypot(b.x - ballRef.current.x, b.z - ballRef.current.z)
            );
            if (attackers[0]) selectFigureById(attackers[0].id, true);
            appendRuleLog(
              'Blocco Difensivo Completato',
              `Ora tocca a ${possessionRef.current === 'home' ? 'Azzurri' : 'Rossi'} proseguire l'azione d'attacco.`,
              'info'
            );
          } else {
            // Attacking flick resolved: did the flicked figure touch the ball?
            if (tr.ballTouchedByFlickedFigure && gameModeRef.current !== GameMode.TRAINING) {
              // Attacker keeps possession, and Defender gets 1 Defensive Positioning Flick!
              const defenderTeam: TeamId = possessionRef.current === 'home' ? 'away' : 'home';
              activeSubTurnRef.current = defenderTeam;
              turnPhaseRef.current = TurnPhase.DEFENSE_POSITION;
              setActiveSubTurnTeam(defenderTeam);
              setTurnPhase(TurnPhase.DEFENSE_POSITION);
              setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);

              const defenders = figuresRef.current.filter((f) => f.team === defenderTeam && f.role !== 'GK');
              defenders.sort(
                (a, b) =>
                  Math.hypot(a.x - ballRef.current.x, a.z - ballRef.current.z) -
                  Math.hypot(b.x - ballRef.current.x, b.z - ballRef.current.z)
              );
              if (defenders[0]) selectFigureById(defenders[0].id, false);
              appendRuleLog(
                'Palla Toccata — Fase Flick Difensivo',
                `${possessionRef.current === 'home' ? 'Azzurri' : 'Rossi'} mantiene il possesso! ${
                  defenderTeam === 'home' ? 'Azzurri' : 'Rossi'
                } può effettuare 1 Flick Difensivo di copertura (senza toccare palla o avversari).`,
                'info'
              );
            } else if (!tr.ballTouchedByFlickedFigure && gameModeRef.current !== GameMode.TRAINING) {
              // Missed the ball -> Possession switches to opponent!
              const nextPossession: TeamId = possessionRef.current === 'home' ? 'away' : 'home';
              figuresRef.current.forEach((f) => (f.flickCount = 0));
              possessionRef.current = nextPossession;
              activeSubTurnRef.current = nextPossession;
              turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
              setPossession(nextPossession);
              setActiveSubTurnTeam(nextPossession);
              setTurnPhase(TurnPhase.ATTACK_SELECT);
              setTurnTimerSec(FISTF_PITCH.TURN_DURATION_SEC);

              const nextFigures = figuresRef.current.filter((f) => f.team === nextPossession);
              nextFigures.sort(
                (a, b) =>
                  Math.hypot(a.x - ballRef.current.x, a.z - ballRef.current.z) -
                  Math.hypot(b.x - ballRef.current.x, b.z - ballRef.current.z)
              );
              if (nextFigures[0]) selectFigureById(nextFigures[0].id, true);
              appendRuleLog(
                'Palla Mancata — Cambio Possesso',
                `La miniatura non ha toccato il pallone: il possesso passa a ${
                  nextPossession === 'home' ? 'Azzurri' : 'Rossi'
                }!`,
                'info'
              );
            } else {
              // Training mode: stay in attack select
              turnPhaseRef.current = TurnPhase.ATTACK_SELECT;
              setTurnPhase(TurnPhase.ATTACK_SELECT);
              selectFigureById(tr.flickedFigureId, true);
            }
          }
          broadcastOnlineState();
        }
      }

      ctrl.syncFiguresAndBall(
        figuresRef.current,
        ballRef.current,
        selectedFigureIdRef.current,
        activeSubTurnRef.current,
        aimAngleRef.current,
        aimPowerRef.current,
        spinYRef.current,
        accessibilityRef.current
      );

      ctrl.updateCameraRig(
        dt,
        figuresRef.current,
        ballRef.current,
        activeSubTurnRef.current,
        accessibilityRef.current.reducedMotion
      );

      ctrl.renderFrame();

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ctrl.dispose();
    };
  }, [appendRuleLog, broadcastOnlineState, selectFigureById, triggerFlickAction]);

  // Keyboard Accessibility & Game Controls (Tab, Arrows, Space Hold-to-Flick, 1-6 Camera, H Dock, Esc Pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (shellScreenRef.current === 'TITLE' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        resetMatch(homeFormation, true);
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (activeModal !== 'NONE') {
          setActiveModal('NONE');
        } else if (shellScreenRef.current === 'PLAYING') {
          setShellScreen('PAUSED');
        } else if (shellScreenRef.current === 'PAUSED') {
          setShellScreen('PLAYING');
        }
        return;
      }

      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
        return;
      }

      // Camera shortcuts 1-6
      const camMap: Record<string, CameraViewMode> = {
        Digit1: CameraViewMode.HYBRID,
        Digit2: CameraViewMode.FPS_PLAYER,
        Digit3: CameraViewMode.ISOMETRIC,
        Digit4: CameraViewMode.BROADCAST,
        Digit5: CameraViewMode.GOAL_CAM,
        Digit6: CameraViewMode.FREE_ORBIT,
      };
      if (camMap[e.code]) {
        const mode = camMap[e.code];
        setCameraMode(mode);
        sceneCtrlRef.current?.setCameraMode(mode);
        return;
      }

      if (shellScreenRef.current !== 'PLAYING') return;

      // Tab: cycle through eligible figures of active team
      if (e.code === 'Tab') {
        e.preventDefault();
        const myTeam = activeSubTurnRef.current;
        const pool = figuresRef.current.filter(
          (f) => f.team === myTeam && f.flickCount < FISTF_PITCH.MAX_FIGURE_FLICKS
        );
        if (pool.length > 0) {
          const idx = pool.findIndex((f) => f.id === selectedFigureIdRef.current);
          const nextIdx = e.shiftKey ? (idx - 1 + pool.length) % pool.length : (idx + 1) % pool.length;
          selectFigureById(pool[nextIdx].id, true);
        }
        return;
      }

      // Left / Right Arrows: fine-tune aim angle
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        const step = e.shiftKey ? 0.02 : 0.07;
        const nextAngle = aimAngleRef.current - step;
        aimAngleRef.current = nextAngle;
        setAimAngle(nextAngle);
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        const step = e.shiftKey ? 0.02 : 0.07;
        const nextAngle = aimAngleRef.current + step;
        aimAngleRef.current = nextAngle;
        setAimAngle(nextAngle);
        return;
      }

      // Up / Down Arrows: adjust power directly
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        const nextP = Math.min(1.0, aimPowerRef.current + 0.06);
        aimPowerRef.current = nextP;
        setAimPower(nextP);
        return;
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        const nextP = Math.max(0.1, aimPowerRef.current - 0.06);
        aimPowerRef.current = nextP;
        setAimPower(nextP);
        return;
      }

      // Spacebar Hold-to-Charge Power (Subbuteo 1990 pattern)
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (turnPhaseRef.current === TurnPhase.SIMULATING) return;
        isChargingRef.current = true;
        chargeDirRef.current = 1;
        aimPowerRef.current = 0.12;
        setAimPower(0.12);
        setIsChargingPower(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isChargingRef.current) {
        e.preventDefault();
        isChargingRef.current = false;
        setIsChargingPower(false);
        triggerFlickAction({
          figureId: selectedFigureIdRef.current,
          team: activeSubTurnRef.current,
          angle: aimAngleRef.current,
          power: aimPowerRef.current,
          spinY: spinYRef.current,
          spinForward: spinForwardRef.current,
          isDefensiveFlick: turnPhaseRef.current === TurnPhase.DEFENSE_POSITION,
        });
      }
    };

    const onWindowBlur = () => {
      isChargingRef.current = false;
      setIsChargingPower(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [activeModal, homeFormation, resetMatch, selectFigureById, triggerFlickAction]);

  // Handlers for camera & formation changes
  const handleSelectCamera = (mode: CameraViewMode) => {
    setCameraMode(mode);
    sceneCtrlRef.current?.setCameraMode(mode);
  };

  const handleFormationChange = (fmt: FormationName) => {
    setHomeFormation(fmt);
    figuresRef.current = createInitialFigures(fmt, '4-3-3');
    ballRef.current = createInitialBall();
    selectFigureById('home_10', true);
    appendRuleLog('Schieramento Aggiornato', `Squadra Azzurri disposta con modulo tattico ${fmt}.`, 'info');
  };

  // Online Room Create / Join handlers
  const handleCreateRoom = () => {
    if (!socketRef.current) return;
    setRoomError(null);
    socketRef.current.emit(
      'room:create',
      {
        roomId: roomCodeInput.trim() || undefined,
        roomName: `Tavolo di ${playerNameInput}`,
        playerName: playerNameInput,
      },
      (res: { ok: boolean; roomId: string; role: 'home' | 'away' | 'spectator'; error?: string }) => {
        if (!res.ok) {
          setRoomError(res.error || 'Impossibile creare la stanza');
          return;
        }
        setCurrentRoomId(res.roomId);
        setMyOnlineRole(res.role);
        setRoomHostName(playerNameInput);
        setRoomGuestName(null);
        setGameMode(GameMode.ONLINE);
        setActiveModal('NONE');
        resetMatch(homeFormation, true);
      }
    );
  };

  const handleJoinRoom = (targetRoomId: string) => {
    if (!socketRef.current || !targetRoomId.trim()) return;
    setRoomError(null);
    socketRef.current.emit(
      'room:join',
      {
        roomId: targetRoomId.trim().toUpperCase(),
        playerName: playerNameInput,
      },
      (res: {
        ok: boolean;
        roomId: string;
        role: 'home' | 'away' | 'spectator';
        hostName?: string;
        guestName?: string | null;
        error?: string;
      }) => {
        if (!res.ok) {
          setRoomError(res.error || 'Stanza non trovata');
          return;
        }
        setCurrentRoomId(res.roomId);
        setMyOnlineRole(res.role);
        if (res.hostName) setRoomHostName(res.hostName);
        if (res.guestName !== undefined) setRoomGuestName(res.guestName);
        setGameMode(GameMode.ONLINE);
        setActiveModal('NONE');
        resetMatch(homeFormation, true);
      }
    );
  };

  const handleCopyBlueprint = () => {
    navigator.clipboard.writeText(BLUEPRINT_MANIFESTO_MD);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2200);
  };

  const handleDownloadBlueprint = () => {
    const blob = new Blob([BLUEPRINT_MANIFESTO_MD], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BLUEPRINT.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const ballInShootingAreaHome = ballRef.current.x >= FISTF_PITCH.SHOOTING_LINE_DIST - 0.5;
  const ballInShootingAreaAway = ballRef.current.x <= -FISTF_PITCH.SHOOTING_LINE_DIST + 0.5;

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${
        accessibility.hudScale === 'large' ? 'text-base' : 'text-sm'
      }`}
    >
      {/* ARIA Live Region for Screen Reader Accessibility */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ruleBanner}
      </div>

      {/* Dedicated Isolated WebGL Canvas Container (100% Unobstructed Viewport) */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full z-0" />

      {/* =====================================================================
          1. TOP PERIMETER SCOREBOARD & FISTF PHASE CLUSTER (Low-Occlusion)
         ===================================================================== */}
      {shellScreen !== 'TITLE' && (
        <header className="pointer-events-none absolute top-3 left-0 right-0 z-10 flex flex-col items-center px-4">
          <div
            className={`pointer-events-auto flex flex-wrap items-center justify-between gap-4 px-5 py-2.5 rounded-xl border ${
              accessibility.highContrast
                ? 'bg-black border-yellow-400 text-white'
                : 'bg-slate-950/92 border-slate-800 text-slate-100'
            } shadow-2xl max-w-5xl w-full`}
          >
            {/* Left: Home Team Score */}
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-8 rounded-sm bg-blue-600 shrink-0" />
              <div>
                <div className="text-xs text-slate-400 font-medium">
                  {gameMode === GameMode.ONLINE ? roomHostName : 'AZZURRI ITALIA'}
                </div>
                <div className="font-display text-xl font-bold tracking-wide text-blue-400">
                  CASA {possession === 'home' ? '· IN POSSESSO' : ''}
                </div>
              </div>
              <div className="font-mono tabular-nums text-3xl font-bold px-3 py-0.5 rounded bg-slate-900 border border-slate-800">
                {scoreHome}
              </div>
            </div>

            {/* Center: Match Clock, Half, Shot Clock & Active Phase */}
            <div className="flex flex-col items-center text-center px-2">
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-300">
                <span>{half}° TEMPO</span>
                <span>·</span>
                <span className="text-emerald-400 font-bold text-base">{formatClock(matchClockSec)}</span>
                <span>·</span>
                <span
                  className={`font-bold ${
                    turnTimerSec <= 8 ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  TURNO {turnTimerSec}s
                </span>
              </div>

              <div className="mt-0.5 flex items-center gap-2 text-xs">
                <span
                  className={`font-semibold ${
                    turnPhase === TurnPhase.DEFENSE_POSITION
                      ? 'text-amber-400'
                      : turnPhase === TurnPhase.SIMULATING
                        ? 'text-emerald-400'
                        : 'text-sky-300'
                  }`}
                >
                  {turnPhase === TurnPhase.DEFENSE_POSITION
                    ? `FLICK DIFENSIVO (${activeSubTurnTeam === 'home' ? 'AZZURRI' : 'ROSSI'})`
                    : turnPhase === TurnPhase.SIMULATING
                      ? 'FISICA IN CORSO...'
                      : `ATTACCO (${activeSubTurnTeam === 'home' ? 'AZZURRI' : 'ROSSI'})`}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums text-slate-300">
                  Flick #{selectedFigureSummary.number}: {selectedFigureSummary.flicks}/3
                </span>
                {(ballInShootingAreaHome || ballInShootingAreaAway) && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-400 font-bold">TIRO VALIDO (ENTRO 300MM)</span>
                  </>
                )}
              </div>
            </div>

            {/* Right: Away Team Score + Utility Actions */}
            <div className="flex items-center gap-3">
              <div className="font-mono tabular-nums text-3xl font-bold px-3 py-0.5 rounded bg-slate-900 border border-slate-800">
                {scoreAway}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 font-medium">
                  {gameMode === GameMode.CPU
                    ? `CPU (${aiDifficulty})`
                    : gameMode === GameMode.ONLINE
                      ? roomGuestName || 'In attesa...'
                      : 'ROSSI CLUB'}
                </div>
                <div className="font-display text-xl font-bold tracking-wide text-rose-400">
                  {possession === 'away' ? 'IN POSSESSO · ' : ''}OSPITI
                </div>
              </div>
              <div className="w-3.5 h-8 rounded-sm bg-rose-600 shrink-0" />

              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-800">
                <button
                  onClick={() =>
                    setAccessibility((a) => ({ ...a, soundEnabled: !a.soundEnabled }))
                  }
                  title={accessibility.soundEnabled ? 'Disattiva Audio' : 'Attiva Audio'}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                >
                  {accessibility.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setActiveModal('ACCESSIBILITY')}
                  title="Opzioni Accessibilità & Vista Tattica Testuale"
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveModal('BLUEPRINT')}
                  title="Regolamento FISTF V5.3 & Blueprint Manifesto .md"
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShellScreen((s) => (s === 'PAUSED' ? 'PLAYING' : 'PAUSED'))}
                  title="Menu Pausa (Esc)"
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Compact Rule / Referee Notification Strip */}
          <div className="mt-1.5 pointer-events-auto flex items-center gap-3 px-4 py-1 rounded-lg bg-slate-950/90 border border-slate-800/90 text-xs text-slate-300">
            <span className="font-semibold text-emerald-400">Arbitro FISTF:</span>
            <span>{ruleBanner}</span>
            {currentRoomId && (
              <>
                <span>·</span>
                <span className="font-mono text-sky-400">Stanza {currentRoomId}</span>
              </>
            )}
          </div>
        </header>
      )}

      {/* =====================================================================
          2. ACCESSIBLE TEXT-ONLY TACTICAL OVERLAY (When toggled by player)
         ===================================================================== */}
      {shellScreen === 'PLAYING' && accessibility.textTacticalOverlay && (
        <aside
          aria-label="Vista Tattica Testuale Accessibile"
          className="pointer-events-auto absolute top-28 left-4 z-20 w-80 max-h-[58vh] overflow-y-auto rounded-xl bg-slate-950/95 border border-emerald-500/60 p-3.5 text-xs text-slate-200 shadow-2xl"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-emerald-400">Radar Testuale Screen-Reader</span>
            <button
              onClick={() => setAccessibility((a) => ({ ...a, textTacticalOverlay: false }))}
              className="text-slate-400 hover:text-white"
            >
              Chiudi
            </button>
          </div>
          <p className="mb-2 text-slate-300">
            Palla a X: <strong className="font-mono">{(ballRef.current.x * 10).toFixed(0)}mm</strong>, Z:{' '}
            <strong className="font-mono">{(ballRef.current.z * 10).toFixed(0)}mm</strong>. Clicca una miniatura per
            mirare automaticamente al pallone:
          </p>
          <div className="space-y-1">
            {figuresRef.current
              .filter((f) => f.team === activeSubTurnTeam)
              .map((f) => {
                const distMm = Math.round(
                  Math.hypot(f.x - ballRef.current.x, f.z - ballRef.current.z) * 10
                );
                const isSel = f.id === selectedFigureId;
                return (
                  <button
                    key={f.id}
                    onClick={() => selectFigureById(f.id, true)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors ${
                      isSel
                        ? 'bg-emerald-600 text-slate-950 font-bold'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    <span>{f.name}</span>
                    <span className="font-mono tabular-nums">
                      {distMm}mm · {f.flickCount}/3
                    </span>
                  </button>
                );
              })}
          </div>
        </aside>
      )}

      {/* =====================================================================
          3. UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK (Zero Side-Panel Clutter)
         ===================================================================== */}
      {shellScreen === 'PLAYING' && (
        <div
          style={{
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'min(960px, 95vw)',
          }}
          className="pointer-events-auto fixed z-20 w-full flex flex-col items-center"
        >
          {/* Collapse / Expand Tab (Cinema / Zen Mode Toggle) */}
          <button
            onClick={() => setDockCollapsed((c) => !c)}
            className="flex items-center gap-1.5 px-4 py-1 rounded-t-lg bg-slate-950/92 border border-b-0 border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mostra Controlli Tattici (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nascondi Controlli · Modalità Zen (H)</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div
              className={`w-full rounded-2xl border p-3.5 shadow-2xl transition-transform ${
                accessibility.highContrast
                  ? 'bg-black border-yellow-400 text-white'
                  : 'bg-slate-950/94 border-slate-800 text-slate-100'
              }`}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                {/* Zone A: 6 Camera Perspective Presets (4 cols) */}
                <div className="lg:col-span-5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                      <Camera className="w-3.5 h-3.5 text-emerald-400" />
                      Prospettiva Visuale (Tasti 1–6)
                    </span>
                    <span className="truncate max-w-[200px] text-[11px]">
                      {CAMERA_LABELS[cameraMode].desc}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800/80">
                    {(Object.keys(CAMERA_LABELS) as CameraViewMode[]).map((mode) => {
                      const active = cameraMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => handleSelectCamera(mode)}
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            active
                              ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800'
                          }`}
                        >
                          {CAMERA_LABELS[mode].key}. {CAMERA_LABELS[mode].short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Zone B: Aim, Power Slider & Spin/Effect Magnus Ball Pad (4 cols) */}
                <div className="lg:col-span-4 flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  {/* Interactive 2D Ball Spin Pad */}
                  <div className="flex flex-col items-center shrink-0">
                    <span className="text-[11px] text-slate-400 mb-1">Effetto Magnus</span>
                    <div
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                        const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
                        const clampedX = Math.max(-1, Math.min(1, nx));
                        const clampedY = Math.max(-1, Math.min(1, ny));
                        // Negative X on ball face = curl right, Positive X = curl left
                        spinYRef.current = -clampedX;
                        spinForwardRef.current = clampedY;
                        setSpinY(-clampedX);
                        setSpinForward(clampedY);
                      }}
                      title="Clicca sul pallone per dare giro laterale (Effetto Magnus) o Topspin/Backspin"
                      className="relative w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-400 border-2 border-emerald-400 cursor-crosshair shadow-inner flex items-center justify-center"
                    >
                      <div className="w-full h-px bg-slate-500/40 absolute" />
                      <div className="h-full w-px bg-slate-500/40 absolute" />
                      {/* Red Contact Point Dot */}
                      <div
                        style={{
                          transform: `translate(${-spinY * 16}px, ${-spinForward * 16}px)`,
                        }}
                        className="w-3 h-3 rounded-full bg-rose-600 border border-white shadow"
                      />
                    </div>
                    <button
                      onClick={() => {
                        spinYRef.current = 0;
                        spinForwardRef.current = 0;
                        setSpinY(0);
                        setSpinForward(0);
                      }}
                      className="text-[10px] text-slate-400 hover:text-white mt-0.5 cursor-pointer"
                    >
                      Reset Spin
                    </button>
                  </div>

                  {/* Aim & Power Sliders */}
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-slate-300 font-medium">
                           Direzione Mira
                        </span>
                        <span className="font-mono tabular-nums text-emerald-400">
                          {Math.round(((aimAngle * 180) / Math.PI + 360) % 360)}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-Math.PI}
                        max={Math.PI}
                        step={0.01}
                        value={aimAngle}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          aimAngleRef.current = val;
                          setAimAngle(val);
                        }}
                        aria-label="Angolo di mira del Flick"
                        className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-slate-300 font-medium">Potenza Flick</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {Math.round(aimPower * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.08}
                        max={1.0}
                        step={0.01}
                        value={aimPower}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          aimPowerRef.current = val;
                          setAimPower(val);
                        }}
                        aria-label="Potenza del Flick"
                        className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Zone C: Execute Flick CTA + Defensive Skip + Formation (3 cols) */}
                <div className="lg:col-span-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onMouseDown={() => {
                        if (turnPhaseRef.current === TurnPhase.SIMULATING) return;
                        isChargingRef.current = true;
                        chargeDirRef.current = 1;
                        setIsChargingPower(true);
                      }}
                      onMouseUp={() => {
                        if (isChargingRef.current) {
                          isChargingRef.current = false;
                          setIsChargingPower(false);
                        }
                        triggerFlickAction({
                          figureId: selectedFigureIdRef.current,
                          team: activeSubTurnRef.current,
                          angle: aimAngleRef.current,
                          power: aimPowerRef.current,
                          spinY: spinYRef.current,
                          spinForward: spinForwardRef.current,
                          isDefensiveFlick: turnPhaseRef.current === TurnPhase.DEFENSE_POSITION,
                        });
                      }}
                      disabled={
                        turnPhase === TurnPhase.SIMULATING ||
                        (gameMode === GameMode.CPU && activeSubTurnTeam === 'away')
                      }
                      className={`flex-1 py-2.5 px-4 rounded-xl font-display text-lg font-bold tracking-wide uppercase transition-transform cursor-pointer whitespace-nowrap shrink-0 ${
                        isChargingPower
                          ? 'bg-amber-400 text-slate-950 scale-[0.98]'
                          : turnPhase === TurnPhase.DEFENSE_POSITION
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {isChargingPower
                        ? `RILASCIA (${Math.round(aimPower * 100)}%)`
                        : turnPhase === TurnPhase.DEFENSE_POSITION
                          ? 'FLICK DIFENSIVO'
                          : 'ESEGUI FLICK (SPAZIO)'}
                    </button>

                    {turnPhase === TurnPhase.DEFENSE_POSITION && (
                      <button
                        onClick={() => skipDefensiveFlick(false)}
                        title="Rinuncia al flick difensivo e lascia tirare l'attaccante"
                        className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Passa
                      </button>
                    )}
                  </div>

                  {/* Formation & Quick Reset Row */}
                  <div className="flex items-center justify-between gap-1.5 text-xs">
                    <select
                      aria-label="Modulo Tattico Squadra"
                      value={homeFormation}
                      onChange={(e) => handleFormationChange(e.target.value as FormationName)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 cursor-pointer"
                    >
                      <option value="4-3-3">Modulo 4-3-3 FISTF</option>
                      <option value="4-4-2">Modulo 4-4-2 Classico</option>
                      <option value="3-5-2">Modulo 3-5-2 Tattico</option>
                      <option value="FISTF-BARRIER">Barriera 300mm</option>
                    </select>

                    <button
                      onClick={() => setActiveModal('LOBBY')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-400 font-medium whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      <span>LAN / Online</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          4. FULL-VIEWPORT TITLE SCREEN OVERLAY (Over Live 3D Stadium Orbit)
         ===================================================================== */}
      {shellScreen === 'TITLE' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col justify-between p-6 md:p-12 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/80">
          {/* Top Minimal Bar */}
          <div className="flex items-center justify-between max-w-6xl w-full mx-auto">
            <div className="flex items-center gap-3">
              {/* Bespoke Inline SVG Subbuteo Figure + Ball Lockup */}
              <svg className="w-10 h-10 text-emerald-400 shrink-0" viewBox="0 0 48 48" fill="none">
                <path
                  d="M10 34C10 40.5 38 40.5 38 34L36 30H12L10 34Z"
                  fill="currentColor"
                  fillOpacity="0.25"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <circle cx="24" cy="13" r="5" stroke="currentColor" strokeWidth="2.5" />
                <path
                  d="M17 29L19 19H29L31 29"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="38" cy="24" r="5" fill="#f8fafc" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="font-display text-2xl font-bold tracking-wider uppercase text-white">
                Virtual Subbuteo 3D
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveModal('BLUEPRINT')}
                className="px-3.5 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Blueprint .MD & Regole FISTF V5.3</span>
              </button>
              <button
                onClick={() => setActiveModal('ACCESSIBILITY')}
                className="px-3.5 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Accessibilità</span>
              </button>
            </div>
          </div>

          {/* Center Hero Lockup with generous negative space showing the live 3D table */}
          <div className="my-auto max-w-3xl mx-auto text-center space-y-5">
            <div className="text-xs font-mono uppercase tracking-widest text-emerald-400">
              FISTF Sport Rules V5.3 · Campo 1200×750mm · Fisica Basi Semisferiche & Effetto Magnus
            </div>

            <h1
              style={{ textWrap: 'balance' }}
              className="font-display text-5xl sm:text-7xl font-bold uppercase tracking-tight text-white drop-shadow-lg"
            >
              Il Calcio da Tavolo 3D nel Tuo Browser
            </h1>

            <p className="text-slate-200 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Scegli fra 6 prospettive (Ibrida FPS/Isometrica, Giocatore in Prima Persona, Ortografica Isoperimetrica),
              impartisci giro ed effetto al pallone e sfida l’IA FISTF o un amico in LAN e Online.
            </p>

            {/* Mode Selection Segmented Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-2xl mx-auto pt-2">
              <button
                onClick={() => setGameMode(GameMode.CPU)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameMode === GameMode.CPU
                    ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg'
                    : 'bg-slate-900/85 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-display text-lg font-bold uppercase text-emerald-400">1v1 vs CPU</div>
                <div className="text-xs text-slate-300 mt-0.5">IA tattica con Flick Difensivo</div>
              </button>

              <button
                onClick={() => setGameMode(GameMode.LAN_LOCAL)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameMode === GameMode.LAN_LOCAL
                    ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg'
                    : 'bg-slate-900/85 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-display text-lg font-bold uppercase text-sky-400">Pass & Play</div>
                <div className="text-xs text-slate-300 mt-0.5">2 Giocatori sullo stesso tavolo</div>
              </button>

              <button
                onClick={() => {
                  setGameMode(GameMode.ONLINE);
                  setActiveModal('LOBBY');
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameMode === GameMode.ONLINE
                    ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg'
                    : 'bg-slate-900/85 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-display text-lg font-bold uppercase text-amber-400">LAN & Online</div>
                <div className="text-xs text-slate-300 mt-0.5">Stanze WebSocket in tempo reale</div>
              </button>

              <button
                onClick={() => setGameMode(GameMode.TRAINING)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameMode === GameMode.TRAINING
                    ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg'
                    : 'bg-slate-900/85 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-display text-lg font-bold uppercase text-purple-400">Allenamento</div>
                <div className="text-xs text-slate-300 mt-0.5">Campo libero senza timer</div>
              </button>
            </div>

            {/* CPU Difficulty Selector when in CPU Mode */}
            {gameMode === GameMode.CPU && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-xs text-slate-300">Livello IA FISTF:</span>
                {[
                  { id: AIDifficulty.ROOKIE, label: 'Esordiente' },
                  { id: AIDifficulty.CLUB, label: 'Club FISTF' },
                  { id: AIDifficulty.MASTER, label: 'Campione Master' },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => setAiDifficulty(lvl.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      aiDifficulty === lvl.id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            )}

            {/* Primary Start CTA */}
            <div className="pt-3 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => resetMatch(homeFormation, true)}
                className="px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display text-2xl font-bold uppercase tracking-wider shadow-xl transition-transform active:scale-95 cursor-pointer flex items-center gap-2.5"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>Scendi in Campo (Invio)</span>
              </button>

              <button
                onClick={() => setActiveModal('LOBBY')}
                className="px-5 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white font-display text-xl font-bold uppercase tracking-wider cursor-pointer flex items-center gap-2"
              >
                <Wifi className="w-5 h-5 text-sky-400" />
                <span>Apri Lobby LAN / Online</span>
              </button>
            </div>
          </div>

          {/* Single Flat Control-Hint Line at Bottom */}
          <div className="text-center text-xs font-mono text-slate-300 tracking-wide">
            Tab Seleziona Miniatura · Mouse / Frecce Mira · Tieni Premuto Spazio per Potenza Flick · 1-6 Cambia Visuale · H Nascondi Dock · Esc Pausa
          </div>
        </div>
      )}

      {/* =====================================================================
          5. PAUSE / VICTORY MODAL
         ===================================================================== */}
      {(shellScreen === 'PAUSED' || shellScreen === 'VICTORY') && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center shadow-2xl space-y-5">
            <h2 className="font-display text-3xl font-bold uppercase text-white">
              {shellScreen === 'VICTORY' ? ' Fischio Finale FISTF' : 'Partita in Pausa'}
            </h2>

            <div className="flex items-center justify-center gap-6 py-3 px-4 rounded-xl bg-slate-950 border border-slate-800">
              <div>
                <div className="text-xs text-blue-400 font-bold uppercase">Azzurri</div>
                <div className="font-mono text-4xl font-bold text-white tabular-nums">{scoreHome}</div>
              </div>
              <div className="text-slate-500 font-mono text-xl">-</div>
              <div>
                <div className="text-xs text-rose-400 font-bold uppercase">Rossi</div>
                <div className="font-mono text-4xl font-bold text-white tabular-nums">{scoreAway}</div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {shellScreen === 'PAUSED' && (
                <button
                  onClick={() => setShellScreen('PLAYING')}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display text-xl font-bold uppercase cursor-pointer"
                >
                  Riprendi Partita (Esc)
                </button>
              )}
              <button
                onClick={() => resetMatch(homeFormation, true)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-display text-lg font-bold uppercase cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Ricomincia da Capo</span>
              </button>
              <button
                onClick={() => setShellScreen('TITLE')}
                className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-sm font-semibold cursor-pointer"
              >
                Torna alla Schermata Titolo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. LAN & ONLINE MULTIPLAYER LOBBY MODAL (Real WebSocket Rooms)
         ===================================================================== */}
      {activeModal === 'LOBBY' && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-sky-400" />
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Multiplayer LAN & Online (Socket.io Real-Time)
                </h2>
              </div>
              <button
                onClick={() => setActiveModal('NONE')}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            {/* LAN Network Discovery Box */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <Wifi className="w-4 h-4" />
                <span>Connessione Diretta Rete Locale (LAN / Wi-Fi) & Online</span>
              </div>
              <p className="text-slate-300">
                Crea una stanza qui sotto e condividi il <strong>Codice Stanza</strong> con un altro dispositivo sulla
                stessa rete LAN o via browser online. Tutte le mosse, gli effetti Magnus e i flick difensivi sono
                sincronizzati in tempo reale dal server.
              </p>
              {lanAddresses.length > 0 && (
                <div className="pt-1 font-mono text-slate-400">
                  Indirizzi LAN rilevati sul server:{' '}
                  {lanAddresses.map((ip) => `http://${ip}:3000`).join(' · ')}
                </div>
              )}
            </div>

            {roomError && (
              <div className="p-3 rounded-lg bg-rose-950/90 border border-rose-500/60 text-xs text-rose-200">
                {roomError}
              </div>
            )}

            {/* Player Name & Room Creation / Join Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Il Tuo Nome Giocatore</label>
                <input
                  type="text"
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                  placeholder="Capitano FISTF"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Codice Stanza (Opzionale)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono uppercase text-white"
                    placeholder="Es. FISTF-1"
                  />
                  <button
                    onClick={handleCreateRoom}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs whitespace-nowrap cursor-pointer"
                  >
                    Crea Tavolo
                  </button>
                  <button
                    onClick={() => handleJoinRoom(roomCodeInput)}
                    className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs whitespace-nowrap cursor-pointer"
                  >
                    Entra
                  </button>
                </div>
              </div>
            </div>

            {/* Active Rooms List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-400" />
                  Tavoli Attivi sul Server ({onlineRooms.length})
                </span>
                <button
                  onClick={() => socketRef.current?.emit('lobby:list')}
                  className="text-sky-400 hover:underline cursor-pointer"
                >
                  Aggiorna lista
                </button>
              </div>

              {onlineRooms.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                  Nessun tavolo online aperto in questo istante. Clicca <strong>Crea Tavolo</strong> per inaugurare una
                  stanza LAN/Online!
                </div>
              ) : (
                <div className="space-y-2">
                  {onlineRooms.map((r) => (
                    <div
                      key={r.roomId}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">{r.roomId}</span>
                          <span className="text-slate-500">·</span>
                          <span className="font-semibold text-white">{r.roomName}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Casa: {r.hostName} vs Ospite: {r.guestName || 'In attesa di sfidante...'} · Punteggio{' '}
                          <span className="font-mono text-slate-200">
                            {r.scoreHome}-{r.scoreAway}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleJoinRoom(r.roomId)}
                        className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                      >
                        {r.guestName ? 'Assisti' : 'Gioca Ora'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. ACCESSIBILITY & CONTROLS CONFIGURATION MODAL
         ===================================================================== */}
      {activeModal === 'ACCESSIBILITY' && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-2xl font-bold uppercase text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-emerald-400" />
                <span>Accessibilità 3D & Controlli</span>
              </h2>
              <button
                onClick={() => setActiveModal('NONE')}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Modalità Alto Contrasto (WCAG AA/AAA)</div>
                  <div className="text-slate-400">Linee campo ad alta visibilità e bordi HUD rinforzati</div>
                </div>
                <input
                  type="checkbox"
                  checked={accessibility.highContrast}
                  onChange={(e) =>
                    setAccessibility((a) => ({ ...a, highContrast: e.target.checked }))
                  }
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Annunci Vocali Screen Reader (Sintesi Vocale IT)</div>
                  <div className="text-slate-400">Legge ad alta voce gol, falli FISTF, rimesse e cambi di turno</div>
                </div>
                <input
                  type="checkbox"
                  checked={accessibility.screenReaderAnnouncements}
                  onChange={(e) =>
                    setAccessibility((a) => ({
                      ...a,
                      screenReaderAnnouncements: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Radar Tattico Solo-Testo (Ispirato a Amaz3D)</div>
                  <div className="text-slate-400">
                    Elenco interattivo delle miniature con coordinate in millimetri e distanza dalla palla
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={accessibility.textTacticalOverlay}
                  onChange={(e) =>
                    setAccessibility((a) => ({ ...a, textTacticalOverlay: e.target.checked }))
                  }
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Riduzione Movimento Camera</div>
                  <div className="text-slate-400">Transizioni telecamera immediate senza oscillazioni</div>
                </div>
                <input
                  type="checkbox"
                  checked={accessibility.reducedMotion}
                  onChange={(e) =>
                    setAccessibility((a) => ({ ...a, reducedMotion: e.target.checked }))
                  }
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Guida Traiettoria Curva 3D sul Panno</div>
                  <div className="text-slate-400">Mostra l’anteprima della curva Magnus prima del tiro</div>
                </div>
                <input
                  type="checkbox"
                  checked={accessibility.showTrajectoryGuide}
                  onChange={(e) =>
                    setAccessibility((a) => ({ ...a, showTrajectoryGuide: e.target.checked }))
                  }
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          8. FISTF V5.3 RULES & GITHUB BLUEPRINT.MD MANIFESTO MODAL
         ===================================================================== */}
      {activeModal === 'BLUEPRINT' && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
              <div>
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Blueprint Manifesto (`BLUEPRINT.md`) & Regolamento FISTF V5.3
                </h2>
                <p className="text-xs text-slate-400">
                  Pronto per la tua repository GitHub Virtual Subbuteo e per DSH
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyBlueprint}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedBlueprint ? 'Copiato negli Appunti!' : 'Copia BLUEPRINT.md'}</span>
                </button>
                <button
                  onClick={handleDownloadBlueprint}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Scarica .MD</span>
                </button>
                <button
                  onClick={() => setActiveModal('NONE')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Chiudi
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text">
              {BLUEPRINT_MANIFESTO_MD}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
