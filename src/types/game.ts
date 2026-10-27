export type TeamId = 'home' | 'away';

export enum CameraViewMode {
  HYBRID = 'HYBRID',
  FPS_PLAYER = 'FPS_PLAYER',
  ISOMETRIC = 'ISOMETRIC',
  BROADCAST = 'BROADCAST',
  GOAL_CAM = 'GOAL_CAM',
  FREE_ORBIT = 'FREE_ORBIT',
}

export enum GameMode {
  CPU = 'CPU',
  LAN_LOCAL = 'LAN_LOCAL',
  ONLINE = 'ONLINE',
  TRAINING = 'TRAINING',
}

export enum AIDifficulty {
  ROOKIE = 'ROOKIE',
  CLUB = 'CLUB',
  MASTER = 'MASTER',
}

export enum TurnPhase {
  ATTACK_SELECT = 'ATTACK_SELECT',
  DEFENSE_POSITION = 'DEFENSE_POSITION',
  SIMULATING = 'SIMULATING',
  SET_PIECE = 'SET_PIECE',
  GOAL_CELEBRATION = 'GOAL_CELEBRATION',
}

export type SetPieceType =
  | 'KICK_OFF'
  | 'THROW_IN'
  | 'CORNER_KICK'
  | 'GOAL_KICK'
  | 'FREE_KICK'
  | 'PENALTY';

export type FormationName = '4-3-3' | '4-4-2' | '3-5-2' | 'FISTF-BARRIER';

export interface PlayerFigure {
  id: string;
  team: TeamId;
  number: number;
  name: string;
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  mass: number;
  /** Consecutive flicks by this figure in current possession (FISTF max = 3) */
  flickCount: number;
  /** Dynamic wobble tilt angles on semi-spherical base (radians) */
  tiltX: number;
  tiltZ: number;
  tiltVelX: number;
  tiltVelZ: number;
  /** Facing angle in radians */
  facing: number;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  mass: number;
  /** Sideways spin (Magnus curl) in rad/s: positive = left curl, negative = right curl */
  spinY: number;
  /** Top/backspin in rad/s: positive = topspin (rolls further), negative = backspin (brakes fast) */
  spinForward: number;
  lastTouchedByTeam: TeamId | null;
  lastTouchedByFigureId: string | null;
  /** X coordinate where the ball was at the start of the flick (for FISTF 300mm shooting area rule) */
  flickStartBallX: number;
}

export interface FlickAction {
  figureId: string;
  team: TeamId;
  angle: number; // radians in XZ plane (0 = +X right, PI = -X left)
  power: number; // 0.05 to 1.0
  spinY: number; // -1.0 (right curl) to +1.0 (left curl)
  spinForward: number; // -1.0 (backspin stop) to +1.0 (topspin drive)
  isDefensiveFlick: boolean;
}

export interface MatchRulesLog {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  type: 'info' | 'foul' | 'goal' | 'setpiece';
}

export interface AccessibilitySettings {
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderAnnouncements: boolean;
  textTacticalOverlay: boolean;
  soundEnabled: boolean;
  hudScale: 'normal' | 'large';
  showTrajectoryGuide: boolean;
}

export interface OnlineRoomSummary {
  roomId: string;
  roomName: string;
  hostName: string;
  guestName: string | null;
  playerCount: number;
  spectatorCount: number;
  scoreHome: number;
  scoreAway: number;
  status: 'waiting' | 'playing' | 'finished';
  isLanReady: boolean;
}

export interface MatchStateSnapshot {
  figures: PlayerFigure[];
  ball: BallState;
  possession: TeamId;
  activeSubTurnTeam: TeamId;
  phase: TurnPhase;
  setPiece: SetPieceType | null;
  scoreHome: number;
  scoreAway: number;
  half: 1 | 2;
  timeRemainingSec: number;
  turnTimerSec: number;
  teamTouchesInPossession: number;
  lastRuleBanner: string;
}

/**
 * Official FISTF Sport Rules V5.3 Dimensions
 * Scaled 1 world unit = 10 mm (so 1200mm x 750mm = 120 x 75 units)
 */
export const FISTF_PITCH = {
  LENGTH_MM: 1200,
  WIDTH_MM: 750,
  FIGURE_HEIGHT_MM: 25,
  BASE_DIAMETER_MM: 22,
  BALL_DIAMETER_MM: 21,
  LENGTH: 120, // X from -60 to +60
  WIDTH: 75, // Z from -37.5 to +37.5
  HALF_L: 60,
  HALF_W: 37.5,
  SHOOTING_LINE_DIST: 30, // 300mm from goal line => x = -30 (Home) and x = +30 (Away)
  PENALTY_AREA_LENGTH: 18, // 180mm
  PENALTY_AREA_WIDTH: 40, // 400mm
  GOAL_AREA_LENGTH: 6, // 60mm
  GOAL_AREA_WIDTH: 22, // 220mm
  PENALTY_SPOT_DIST: 12, // 120mm from goal line => x = ±48
  GOAL_WIDTH: 12.5, // 125mm internal width
  GOAL_DEPTH: 4.8, // 48mm depth
  GOAL_HEIGHT: 6.5, // 65mm height
  CENTER_CIRCLE_RADIUS: 10, // 100mm radius
  BORDER_SURROUND: 8, // 80mm surround baize
  FIGURE_RADIUS: 1.15, // 23mm diameter weighted base
  BALL_RADIUS: 1.05, // 21mm diameter ball
  MAX_FIGURE_FLICKS: 3,
  MAX_TEAM_TOUCHES_BEFORE_SHOOT: 3,
  TURN_DURATION_SEC: 30,
};
