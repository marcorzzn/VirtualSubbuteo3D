import {
  AIDifficulty,
  BallState,
  FISTF_PITCH,
  FlickAction,
  FormationName,
  PlayerFigure,
  SetPieceType,
  TeamId,
} from '../types/game';
import { soundEngine } from '../utils/sound';

const ITALIAN_NAMES_HOME = [
  '1. Buffon (GK)',
  '2. Bergomi',
  '3. Maldini',
  '4. Baresi',
  '5. Cannavaro',
  '6. Pirlo',
  '7. Tardelli',
  '8. De Rossi',
  '9. Rossi',
  '10. Baggio',
  '11. Del Piero',
];

const ITALIAN_NAMES_AWAY = [
  '1. Zamora (GK)',
  '2. Cafu',
  '3. Roberto Carlos',
  '4. Beckenbauer',
  '5. Puyol',
  '6. Zidane',
  '7. Iniesta',
  '8. Modric',
  '9. Ronaldo',
  '10. Maradona',
  '11. Cruyff',
];

export function createInitialFigures(
  homeFormation: FormationName = '4-3-3',
  awayFormation: FormationName = '4-3-3'
): PlayerFigure[] {
  const figures: PlayerFigure[] = [];

  const getCoords = (formation: FormationName, isHome: boolean): Array<{ x: number; z: number; role: PlayerFigure['role'] }> => {
    const dir = isHome ? 1 : -1;
    // Home defends -X (-60) and attacks +X (+60)
    const gkX = -56.5 * dir;

    if (formation === '4-4-2') {
      return [
        { x: gkX, z: 0, role: 'GK' },
        { x: -41 * dir, z: -22, role: 'DEF' },
        { x: -43 * dir, z: -7.5, role: 'DEF' },
        { x: -43 * dir, z: 7.5, role: 'DEF' },
        { x: -41 * dir, z: 22, role: 'DEF' },
        { x: -24 * dir, z: -24, role: 'MID' },
        { x: -26 * dir, z: -8, role: 'MID' },
        { x: -26 * dir, z: 8, role: 'MID' },
        { x: -24 * dir, z: 24, role: 'MID' },
        { x: -9 * dir, z: -10, role: 'FWD' },
        { x: -9 * dir, z: 10, role: 'FWD' },
      ];
    }

    if (formation === '3-5-2') {
      return [
        { x: gkX, z: 0, role: 'GK' },
        { x: -43 * dir, z: -15, role: 'DEF' },
        { x: -45 * dir, z: 0, role: 'DEF' },
        { x: -43 * dir, z: 15, role: 'DEF' },
        { x: -27 * dir, z: -26, role: 'MID' },
        { x: -29 * dir, z: -11, role: 'MID' },
        { x: -24 * dir, z: 0, role: 'MID' },
        { x: -29 * dir, z: 11, role: 'MID' },
        { x: -27 * dir, z: 26, role: 'MID' },
        { x: -10 * dir, z: -9, role: 'FWD' },
        { x: -10 * dir, z: 9, role: 'FWD' },
      ];
    }

    if (formation === 'FISTF-BARRIER') {
      // Classic FISTF table-football defensive line along the 300mm shooting line
      return [
        { x: gkX, z: 0, role: 'GK' },
        { x: -32 * dir, z: -26, role: 'DEF' },
        { x: -32 * dir, z: -16, role: 'DEF' },
        { x: -32 * dir, z: -6, role: 'DEF' },
        { x: -32 * dir, z: 6, role: 'DEF' },
        { x: -32 * dir, z: 16, role: 'DEF' },
        { x: -32 * dir, z: 26, role: 'DEF' },
        { x: -18 * dir, z: -14, role: 'MID' },
        { x: -18 * dir, z: 0, role: 'MID' },
        { x: -18 * dir, z: 14, role: 'MID' },
        { x: -8 * dir, z: 0, role: 'FWD' },
      ];
    }

    // Default 4-3-3
    return [
      { x: gkX, z: 0, role: 'GK' },
      { x: -41 * dir, z: -23, role: 'DEF' },
      { x: -43 * dir, z: -8, role: 'DEF' },
      { x: -43 * dir, z: 8, role: 'DEF' },
      { x: -41 * dir, z: 23, role: 'DEF' },
      { x: -25 * dir, z: -16, role: 'MID' },
      { x: -27 * dir, z: 0, role: 'MID' },
      { x: -25 * dir, z: 16, role: 'MID' },
      { x: -11 * dir, z: -20, role: 'FWD' },
      { x: -8 * dir, z: 0, role: 'FWD' },
      { x: -11 * dir, z: 20, role: 'FWD' },
    ];
  };

  const homeCoords = getCoords(homeFormation, true);
  homeCoords.forEach((c, idx) => {
    figures.push({
      id: `home_${idx + 1}`,
      team: 'home',
      number: idx + 1,
      name: ITALIAN_NAMES_HOME[idx],
      role: c.role,
      x: c.x,
      z: c.z,
      vx: 0,
      vz: 0,
      radius: FISTF_PITCH.FIGURE_RADIUS,
      mass: 2.1,
      flickCount: 0,
      tiltX: 0,
      tiltZ: 0,
      tiltVelX: 0,
      tiltVelZ: 0,
      facing: 0,
    });
  });

  const awayCoords = getCoords(awayFormation, false);
  awayCoords.forEach((c, idx) => {
    figures.push({
      id: `away_${idx + 1}`,
      team: 'away',
      number: idx + 1,
      name: ITALIAN_NAMES_AWAY[idx],
      role: c.role,
      x: c.x,
      z: c.z,
      vx: 0,
      vz: 0,
      radius: FISTF_PITCH.FIGURE_RADIUS,
      mass: 2.1,
      flickCount: 0,
      tiltX: 0,
      tiltZ: 0,
      tiltVelX: 0,
      tiltVelZ: 0,
      facing: Math.PI,
    });
  });

  return figures;
}

export function createInitialBall(): BallState {
  return {
    x: 0,
    y: FISTF_PITCH.BALL_RADIUS,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: FISTF_PITCH.BALL_RADIUS,
    mass: 1.0,
    spinY: 0,
    spinForward: 0,
    lastTouchedByTeam: null,
    lastTouchedByFigureId: null,
    flickStartBallX: 0,
  };
}

export interface FlickTurnOutcome {
  settled: boolean;
  goalScoredBy: TeamId | null;
  disallowedGoalOutsideShootingArea: boolean;
  foulCommitted: string | null;
  outOfBounds: {
    type: SetPieceType;
    awardedTo: TeamId;
    restartX: number;
    restartZ: number;
  } | null;
  ballTouchedByFlickedFigure: boolean;
  hitOpponentBeforeBall: boolean;
}

export interface ActiveFlickTracker {
  flickedFigureId: string;
  flickedTeam: TeamId;
  isDefensiveFlick: boolean;
  pendingSpinY: number;
  pendingSpinForward: number;
  ballTouchedByFlickedFigure: boolean;
  hitOpponentBeforeBall: boolean;
  hitAnyFigure: boolean;
}

/**
 * Apply a player or AI flick to a figure
 */
export function applyFlickToState(
  figures: PlayerFigure[],
  ball: BallState,
  action: FlickAction
): ActiveFlickTracker {
  const fig = figures.find((f) => f.id === action.figureId);
  if (fig) {
    const clampedPower = Math.max(0.05, Math.min(1.0, action.power));
    const maxSpeed = action.isDefensiveFlick ? 54 : 88;
    const speed = 16 + clampedPower * maxSpeed;

    fig.vx = Math.cos(action.angle) * speed;
    fig.vz = Math.sin(action.angle) * speed;
    fig.facing = action.angle;

    // Initial impulse wobble on the semi-spherical base
    fig.tiltVelX += -Math.sin(action.angle) * clampedPower * 12;
    fig.tiltVelZ += Math.cos(action.angle) * clampedPower * 12;

    if (!action.isDefensiveFlick) {
      fig.flickCount += 1;
      // Reset other teammates' consecutive flick count per FISTF rules
      figures.forEach((other) => {
        if (other.team === fig.team && other.id !== fig.id) {
          other.flickCount = 0;
        }
      });
    }

    soundEngine.playFlick(clampedPower, fig.x);
  }

  ball.flickStartBallX = ball.x;

  return {
    flickedFigureId: action.figureId,
    flickedTeam: action.team,
    isDefensiveFlick: action.isDefensiveFlick,
    pendingSpinY: action.spinY,
    pendingSpinForward: action.spinForward,
    ballTouchedByFlickedFigure: false,
    hitOpponentBeforeBall: false,
    hitAnyFigure: false,
  };
}

/**
 * Step the Subbuteo physics world forward by dt seconds (sub-stepped for crisp collision accuracy)
 */
export function stepSubbuteoPhysics(
  figures: PlayerFigure[],
  ball: BallState,
  tracker: ActiveFlickTracker | null,
  dt: number
): FlickTurnOutcome {
  const subSteps = 4;
  const subDt = Math.min(dt, 0.04) / subSteps;

  let goalScoredBy: TeamId | null = null;
  let disallowedGoalOutsideShootingArea = false;
  let outOfBounds: FlickTurnOutcome['outOfBounds'] = null;

  for (let s = 0; s < subSteps; s++) {
    // 1. Advance figures on felt surface
    for (let i = 0; i < figures.length; i++) {
      const f = figures[i];
      f.x += f.vx * subDt;
      f.z += f.vz * subDt;

      // Baize felt friction on weighted acrylic base (exponential + Coulomb dry friction near stop)
      const speed = Math.hypot(f.vx, f.vz);
      if (speed > 0.001) {
        const drag = Math.exp(-3.4 * subDt);
        f.vx *= drag;
        f.vz *= drag;
        const dryDecel = 7.5 * subDt;
        if (speed <= dryDecel) {
          f.vx = 0;
          f.vz = 0;
        } else {
          f.vx -= (f.vx / speed) * dryDecel;
          f.vz -= (f.vz / speed) * dryDecel;
        }
      }

      // Goalkeeper constraint within penalty box if GK role
      if (f.role === 'GK') {
        const minX = f.team === 'home' ? -FISTF_PITCH.HALF_L - 1.5 : FISTF_PITCH.HALF_L - FISTF_PITCH.PENALTY_AREA_LENGTH;
        const maxX = f.team === 'home' ? -FISTF_PITCH.HALF_L + FISTF_PITCH.PENALTY_AREA_LENGTH : FISTF_PITCH.HALF_L + 1.5;
        const maxZ = FISTF_PITCH.PENALTY_AREA_WIDTH / 2;
        if (f.x < minX) {
          f.x = minX;
          f.vx = 0;
        }
        if (f.x > maxX) {
          f.x = maxX;
          f.vx = 0;
        }
        if (f.z < -maxZ) {
          f.z = -maxZ;
          f.vz = 0;
        }
        if (f.z > maxZ) {
          f.z = maxZ;
          f.vz = 0;
        }
      }

      // Surround table barrier bounce for figures
      const limitX = FISTF_PITCH.HALF_L + FISTF_PITCH.BORDER_SURROUND - f.radius;
      const limitZ = FISTF_PITCH.HALF_W + FISTF_PITCH.BORDER_SURROUND - f.radius;
      if (f.x < -limitX) {
        f.x = -limitX;
        f.vx = -f.vx * 0.4;
      } else if (f.x > limitX) {
        f.x = limitX;
        f.vx = -f.vx * 0.4;
      }
      if (f.z < -limitZ) {
        f.z = -limitZ;
        f.vz = -f.vz * 0.4;
      } else if (f.z > limitZ) {
        f.z = limitZ;
        f.vz = -f.vz * 0.4;
      }

      // Semi-spherical base harmonic wobble physics
      const stiffness = 75;
      const damping = 6.2;
      const accelTiltX = -stiffness * f.tiltX - damping * f.tiltVelX - f.vz * 0.18;
      const accelTiltZ = -stiffness * f.tiltZ - damping * f.tiltVelZ + f.vx * 0.18;
      f.tiltVelX += accelTiltX * subDt;
      f.tiltVelZ += accelTiltZ * subDt;
      f.tiltX = Math.max(-0.42, Math.min(0.42, f.tiltX + f.tiltVelX * subDt));
      f.tiltZ = Math.max(-0.42, Math.min(0.42, f.tiltZ + f.tiltVelZ * subDt));
    }

    // 2. Advance ball with Magnus Spin curl & topspin/backspin
    const ballSpeed = Math.hypot(ball.vx, ball.vz);
    if (ballSpeed > 0.001) {
      // Magnus sideways force perpendicular to velocity
      const magnusStrength = 0.048;
      const axMagnus = -ball.vz * ball.spinY * magnusStrength;
      const azMagnus = ball.vx * ball.spinY * magnusStrength;

      ball.vx += axMagnus * subDt;
      ball.vz += azMagnus * subDt;

      // Forward topspin/backspin effect along movement direction
      const dirX = ball.vx / ballSpeed;
      const dirZ = ball.vz / ballSpeed;
      const spinAccel = ball.spinForward * 5.2;
      ball.vx += dirX * spinAccel * subDt;
      ball.vz += dirZ * spinAccel * subDt;

      ball.x += ball.vx * subDt;
      ball.z += ball.vz * subDt;

      // Felt rolling resistance
      const ballDrag = Math.exp(-1.55 * subDt);
      ball.vx *= ballDrag;
      ball.vz *= ballDrag;

      const dryBallDecel = 3.2 * subDt;
      const newSpeed = Math.hypot(ball.vx, ball.vz);
      if (newSpeed <= dryBallDecel) {
        ball.vx = 0;
        ball.vz = 0;
      } else {
        ball.vx -= (ball.vx / newSpeed) * dryBallDecel;
        ball.vz -= (ball.vz / newSpeed) * dryBallDecel;
      }
    }

    // Decay ball spin
    ball.spinY *= Math.exp(-1.9 * subDt);
    ball.spinForward *= Math.exp(-2.8 * subDt);

    // 3. Figure-to-Figure collisions
    for (let i = 0; i < figures.length; i++) {
      for (let j = i + 1; j < figures.length; j++) {
        const a = figures[i];
        const b = figures[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;

        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.z -= nz * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.z += nz * overlap * 0.5;

          const rvx = b.vx - a.vx;
          const rvz = b.vz - a.vz;
          const velAlongNormal = rvx * nx + rvz * nz;

          if (velAlongNormal < 0) {
            const restitution = 0.72;
            const impulse = (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
            const ix = impulse * nx;
            const iz = impulse * nz;
            a.vx -= ix / a.mass;
            a.vz -= iz / a.mass;
            b.vx += ix / b.mass;
            b.vz += iz / b.mass;

            // Wobble on collision
            a.tiltVelX -= nz * Math.abs(velAlongNormal) * 0.35;
            a.tiltVelZ += nx * Math.abs(velAlongNormal) * 0.35;
            b.tiltVelX += nz * Math.abs(velAlongNormal) * 0.35;
            b.tiltVelZ -= nx * Math.abs(velAlongNormal) * 0.35;

            if (s === 0 && Math.abs(velAlongNormal) > 3) {
              soundEngine.playBaseClack(Math.abs(velAlongNormal), (a.x + b.x) * 0.5);
            }

            if (tracker) {
              tracker.hitAnyFigure = true;
              const involvesFlicked = a.id === tracker.flickedFigureId || b.id === tracker.flickedFigureId;
              const isOpponentCollision = a.team !== b.team;
              if (involvesFlicked && isOpponentCollision && !tracker.ballTouchedByFlickedFigure) {
                tracker.hitOpponentBeforeBall = true;
              }
            }
          }
        }
      }
    }

    // 4. Figure-to-Ball collisions
    for (let i = 0; i < figures.length; i++) {
      const f = figures[i];
      const dx = ball.x - f.x;
      const dz = ball.z - f.z;
      const dist = Math.hypot(dx, dz);
      const minDist = f.radius + ball.radius;

      if (dist > 0 && dist < minDist) {
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;

        ball.x += nx * overlap * 0.78;
        ball.z += nz * overlap * 0.78;
        f.x -= nx * overlap * 0.22;
        f.z -= nz * overlap * 0.22;

        const rvx = ball.vx - f.vx;
        const rvz = ball.vz - f.vz;
        const velAlongNormal = rvx * nx + rvz * nz;

        if (velAlongNormal < 0) {
          const restitution = 0.86;
          const impulse = (-(1 + restitution) * velAlongNormal) / (1 / f.mass + 1 / ball.mass);
          const ix = impulse * nx;
          const iz = impulse * nz;

          f.vx -= (ix / f.mass) * 0.55;
          f.vz -= (iz / f.mass) * 0.55;
          ball.vx += (ix / ball.mass) * 1.12;
          ball.vz += (iz / ball.mass) * 1.12;

          f.tiltVelX -= nz * Math.abs(velAlongNormal) * 0.22;
          f.tiltVelZ += nx * Math.abs(velAlongNormal) * 0.22;

          ball.lastTouchedByTeam = f.team;
          ball.lastTouchedByFigureId = f.id;

          if (tracker && f.id === tracker.flickedFigureId) {
            if (!tracker.ballTouchedByFlickedFigure) {
              tracker.ballTouchedByFlickedFigure = true;
              // Impart player's chosen spin & curl to the ball on strike
              ball.spinY = tracker.pendingSpinY * 22;
              ball.spinForward = tracker.pendingSpinForward * 8;
            }
          }

          if (Math.abs(velAlongNormal) > 2.5) {
            soundEngine.playBallHit(Math.abs(velAlongNormal), ball.x);
          }
        }
      }
    }

    // 5. Goal Posts & Net Collisions
    const goalHalfW = FISTF_PITCH.GOAL_WIDTH / 2;
    const postRadius = 0.35;
    const posts = [
      { x: -FISTF_PITCH.HALF_L, z: -goalHalfW },
      { x: -FISTF_PITCH.HALF_L, z: goalHalfW },
      { x: FISTF_PITCH.HALF_L, z: -goalHalfW },
      { x: FISTF_PITCH.HALF_L, z: goalHalfW },
    ];

    for (const post of posts) {
      const dx = ball.x - post.x;
      const dz = ball.z - post.z;
      const dist = Math.hypot(dx, dz);
      const minDist = ball.radius + postRadius;
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist;
        const nz = dz / dist;
        ball.x = post.x + nx * minDist;
        ball.z = post.z + nz * minDist;
        const dot = ball.vx * nx + ball.vz * nz;
        if (dot < 0) {
          ball.vx -= 1.75 * dot * nx;
          ball.vz -= 1.75 * dot * nz;
          soundEngine.playPostPing();
        }
      }
    }

    // Check if ball is inside either goal mouth
    const inGoalZ = Math.abs(ball.z) < goalHalfW - ball.radius * 0.25;
    if (inGoalZ && !goalScoredBy && !disallowedGoalOutsideShootingArea) {
      // Away scores in Home goal (-X)
      if (ball.x < -FISTF_PITCH.HALF_L - ball.radius * 0.4) {
        // FISTF Rule: Ball must have started inside the 300mm Shooting Area (x <= -30) if shot by Away
        if (ball.lastTouchedByTeam === 'away' && ball.flickStartBallX > -FISTF_PITCH.SHOOTING_LINE_DIST + 0.5) {
          disallowedGoalOutsideShootingArea = true;
          outOfBounds = {
            type: 'GOAL_KICK',
            awardedTo: 'home',
            restartX: -FISTF_PITCH.HALF_L + FISTF_PITCH.GOAL_AREA_LENGTH,
            restartZ: 0,
          };
          ball.vx = 0;
          ball.vz = 0;
        } else {
          goalScoredBy = 'away';
          // Net dampening
          ball.vx *= 0.25;
          ball.vz *= 0.25;
          if (ball.x < -FISTF_PITCH.HALF_L - FISTF_PITCH.GOAL_DEPTH + ball.radius) {
            ball.x = -FISTF_PITCH.HALF_L - FISTF_PITCH.GOAL_DEPTH + ball.radius;
            ball.vx = 0;
            ball.vz = 0;
          }
        }
      }
      // Home scores in Away goal (+X)
      else if (ball.x > FISTF_PITCH.HALF_L + ball.radius * 0.4) {
        if (ball.lastTouchedByTeam === 'home' && ball.flickStartBallX < FISTF_PITCH.SHOOTING_LINE_DIST - 0.5) {
          disallowedGoalOutsideShootingArea = true;
          outOfBounds = {
            type: 'GOAL_KICK',
            awardedTo: 'away',
            restartX: FISTF_PITCH.HALF_L - FISTF_PITCH.GOAL_AREA_LENGTH,
            restartZ: 0,
          };
          ball.vx = 0;
          ball.vz = 0;
        } else {
          goalScoredBy = 'home';
          ball.vx *= 0.25;
          ball.vz *= 0.25;
          if (ball.x > FISTF_PITCH.HALF_L + FISTF_PITCH.GOAL_DEPTH - ball.radius) {
            ball.x = FISTF_PITCH.HALF_L + FISTF_PITCH.GOAL_DEPTH - ball.radius;
            ball.vx = 0;
            ball.vz = 0;
          }
        }
      }
    }

    // 6. Check Sidelines (Throw-in) & Goal Lines outside goal posts (Corner / Goal Kick)
    if (!goalScoredBy && !outOfBounds) {
      if (Math.abs(ball.z) > FISTF_PITCH.HALF_W + ball.radius) {
        const lastTeam = ball.lastTouchedByTeam || (tracker ? tracker.flickedTeam : 'home');
        const awardedTo: TeamId = lastTeam === 'home' ? 'away' : 'home';
        const clampedX = Math.max(-FISTF_PITCH.HALF_L + 3, Math.min(FISTF_PITCH.HALF_L - 3, ball.x));
        const sideZ = ball.z > 0 ? FISTF_PITCH.HALF_W - 0.8 : -FISTF_PITCH.HALF_W + 0.8;
        outOfBounds = {
          type: 'THROW_IN',
          awardedTo,
          restartX: clampedX,
          restartZ: sideZ,
        };
        ball.vx = 0;
        ball.vz = 0;
      } else if (!inGoalZ && Math.abs(ball.x) > FISTF_PITCH.HALF_L + ball.radius) {
        const lastTeam = ball.lastTouchedByTeam || (tracker ? tracker.flickedTeam : 'home');
        const wentOutLeft = ball.x < 0; // Home goal line
        const cornerZ = ball.z >= 0 ? FISTF_PITCH.HALF_W - 1.5 : -FISTF_PITCH.HALF_W + 1.5;

        if (wentOutLeft) {
          if (lastTeam === 'home') {
            // Corner kick for Away
            outOfBounds = {
              type: 'CORNER_KICK',
              awardedTo: 'away',
              restartX: -FISTF_PITCH.HALF_L + 1.5,
              restartZ: cornerZ,
            };
          } else {
            // Goal kick for Home
            outOfBounds = {
              type: 'GOAL_KICK',
              awardedTo: 'home',
              restartX: -FISTF_PITCH.HALF_L + FISTF_PITCH.GOAL_AREA_LENGTH,
              restartZ: ball.z >= 0 ? 6 : -6,
            };
          }
        } else {
          if (lastTeam === 'away') {
            // Corner kick for Home
            outOfBounds = {
              type: 'CORNER_KICK',
              awardedTo: 'home',
              restartX: FISTF_PITCH.HALF_L - 1.5,
              restartZ: cornerZ,
            };
          } else {
            // Goal kick for Away
            outOfBounds = {
              type: 'GOAL_KICK',
              awardedTo: 'away',
              restartX: FISTF_PITCH.HALF_L - FISTF_PITCH.GOAL_AREA_LENGTH,
              restartZ: ball.z >= 0 ? 6 : -6,
            };
          }
        }
        ball.vx = 0;
        ball.vz = 0;
      }
    }
  }

  // Determine if all entities have settled
  let maxVel = Math.hypot(ball.vx, ball.vz);
  for (let i = 0; i < figures.length; i++) {
    const v = Math.hypot(figures[i].vx, figures[i].vz);
    if (v > maxVel) maxVel = v;
  }

  const settled = maxVel < 0.15 || goalScoredBy !== null || outOfBounds !== null;

  let foulCommitted: string | null = null;
  if (settled && tracker) {
    if (tracker.isDefensiveFlick && (tracker.ballTouchedByFlickedFigure || tracker.hitAnyFigure)) {
      foulCommitted = 'Fallo FISTF nel Flick Difensivo (contatto con palla o figura): punizione avversaria!';
    } else if (!tracker.isDefensiveFlick && tracker.hitOpponentBeforeBall) {
      foulCommitted = 'Fallo FISTF (Back-Flick): colpito avversario prima del pallone!';
    }
  }

  return {
    settled,
    goalScoredBy,
    disallowedGoalOutsideShootingArea,
    foulCommitted,
    outOfBounds,
    ballTouchedByFlickedFigure: tracker ? tracker.ballTouchedByFlickedFigure : false,
    hitOpponentBeforeBall: tracker ? tracker.hitOpponentBeforeBall : false,
  };
}

/**
 * Reposition closest figure for a set piece (Throw-in, Corner, Goal Kick, Free Kick)
 */
export function setupSetPiecePosition(
  figures: PlayerFigure[],
  ball: BallState,
  awardedTo: TeamId,
  restartX: number,
  restartZ: number,
  type: SetPieceType
): string {
  ball.x = restartX;
  ball.z = restartZ;
  ball.vx = 0;
  ball.vz = 0;
  ball.spinY = 0;
  ball.spinForward = 0;
  ball.flickStartBallX = restartX;

  // Reset consecutive flick counters on restart
  figures.forEach((f) => {
    f.flickCount = 0;
    f.vx = 0;
    f.vz = 0;
  });

  // Find closest outfield taker from awardedTo team
  const candidates = figures.filter((f) => f.team === awardedTo && (type === 'GOAL_KICK' || f.role !== 'GK'));
  let taker = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - restartX, c.z - restartZ);
    if (d < bestDist) {
      bestDist = d;
      taker = c;
    }
  }

  if (taker) {
    const goalX = awardedTo === 'home' ? FISTF_PITCH.HALF_L : -FISTF_PITCH.HALF_L;
    const angleToGoal = Math.atan2(0 - restartZ, goalX - restartX);
    taker.x = restartX - Math.cos(angleToGoal) * 3.2;
    taker.z = restartZ - Math.sin(angleToGoal) * 3.2;
    taker.facing = angleToGoal;
  }

  // Push any opponent figures at least 9 units (90mm FISTF rule) away from the ball
  for (const f of figures) {
    if (f.team !== awardedTo && f.role !== 'GK') {
      const dx = f.x - restartX;
      const dz = f.z - restartZ;
      const d = Math.hypot(dx, dz);
      if (d < 9.5) {
        const pushAngle = d > 0.01 ? Math.atan2(dz, dx) : 0;
        f.x = Math.max(-FISTF_PITCH.HALF_L + 2, Math.min(FISTF_PITCH.HALF_L - 2, restartX + Math.cos(pushAngle) * 10));
        f.z = Math.max(-FISTF_PITCH.HALF_W + 2, Math.min(FISTF_PITCH.HALF_W - 2, restartZ + Math.sin(pushAngle) * 10));
      }
    }
  }

  return taker ? taker.id : `${awardedTo}_10`;
}

/**
 * Tactical FISTF AI Decision Engine (Inspired by Subbuteo 1990 & FISTF Club Tactics)
 */
export function computeCpuFlickAction(
  figures: PlayerFigure[],
  ball: BallState,
  aiTeam: TeamId,
  isDefensiveFlick: boolean,
  difficulty: AIDifficulty
): FlickAction {
  const myFigures = figures.filter((f) => f.team === aiTeam);
  const ownGoalX = aiTeam === 'away' ? FISTF_PITCH.HALF_L : -FISTF_PITCH.HALF_L;
  const targetGoalX = aiTeam === 'away' ? -FISTF_PITCH.HALF_L : FISTF_PITCH.HALF_L;

  const jitter =
    difficulty === AIDifficulty.ROOKIE ? 0.14 : difficulty === AIDifficulty.CLUB ? 0.05 : 0.012;

  if (isDefensiveFlick) {
    // Choose a defender to place between the ball and our goal without hitting the ball
    const desiredBlockX = ball.x + (ownGoalX - ball.x) * 0.32;
    const desiredBlockZ = ball.z * 0.65;

    let bestFig = myFigures[1];
    let bestScore = Infinity;

    for (const f of myFigures) {
      if (f.role === 'GK') continue;
      const distToBlock = Math.hypot(f.x - desiredBlockX, f.z - desiredBlockZ);
      const distToBall = Math.hypot(f.x - ball.x, f.z - ball.z);
      // Avoid figures where the path goes straight through the ball
      if (distToBall > 5 && distToBlock < bestScore) {
        bestScore = distToBlock;
        bestFig = f;
      }
    }

    const dx = desiredBlockX - bestFig.x;
    const dz = desiredBlockZ - bestFig.z;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx) + (Math.random() - 0.5) * jitter;
    const power = Math.max(0.12, Math.min(0.55, dist / 28));

    return {
      figureId: bestFig.id,
      team: aiTeam,
      angle,
      power,
      spinY: 0,
      spinForward: 0,
      isDefensiveFlick: true,
    };
  }

  // Offensive Flick: pick eligible figure (flickCount < 3) closest and best aligned to push ball toward targetGoalX
  const eligible = myFigures.filter((f) => f.flickCount < FISTF_PITCH.MAX_FIGURE_FLICKS);
  const pool = eligible.length > 0 ? eligible : myFigures;

  const inShootingArea =
    aiTeam === 'away'
      ? ball.x <= -FISTF_PITCH.SHOOTING_LINE_DIST + 0.5
      : ball.x >= FISTF_PITCH.SHOOTING_LINE_DIST - 0.5;

  // Aim at a corner of the opponent's goal if inside the 300mm shooting area, otherwise aim into the shooting area
  const opponentGk = figures.find((f) => f.team !== aiTeam && f.role === 'GK');
  const gkZ = opponentGk ? opponentGk.z : 0;
  const aimGoalZ = gkZ >= 0 ? -3.8 : 3.8;
  const targetX = inShootingArea ? targetGoalX : aiTeam === 'away' ? -36 : 36;
  const targetZ = inShootingArea ? aimGoalZ : ball.z * 0.4;

  // Vector from ball to target
  const ballToTargetAngle = Math.atan2(targetZ - ball.z, targetX - ball.x);
  // Contact point on the back of the ball
  const contactX = ball.x - Math.cos(ballToTargetAngle) * (ball.radius + FISTF_PITCH.FIGURE_RADIUS * 0.85);
  const contactZ = ball.z - Math.sin(ballToTargetAngle) * (ball.radius + FISTF_PITCH.FIGURE_RADIUS * 0.85);

  let chosenFig = pool[0];
  let bestScore = Infinity;

  for (const f of pool) {
    if (f.role === 'GK' && Math.abs(ball.x - ownGoalX) > 20) continue;
    const dist = Math.hypot(f.x - contactX, f.z - contactZ);
    const figToBallAngle = Math.atan2(ball.z - f.z, ball.x - f.x);
    const angleDiff = Math.abs(Math.atan2(Math.sin(figToBallAngle - ballToTargetAngle), Math.cos(figToBallAngle - ballToTargetAngle)));
    const score = dist + angleDiff * 14;
    if (score < bestScore) {
      bestScore = score;
      chosenFig = f;
    }
  }

  const dx = contactX - chosenFig.x;
  const dz = contactZ - chosenFig.z;
  const distToBall = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx) + (Math.random() - 0.5) * jitter;

  const basePower = inShootingArea
    ? Math.min(0.92, 0.58 + distToBall / 45)
    : Math.min(0.68, 0.34 + distToBall / 42);

  // Add subtle curl if Master or Club shooting on goal
  const spinY =
    inShootingArea && difficulty !== AIDifficulty.ROOKIE
      ? aimGoalZ > 0
        ? -0.35
        : 0.35
      : 0;

  return {
    figureId: chosenFig.id,
    team: aiTeam,
    angle,
    power: Math.max(0.18, basePower),
    spinY,
    spinForward: inShootingArea ? 0.25 : -0.15,
    isDefensiveFlick: false,
  };
}

/**
 * Predict curved ball trajectory points for the 3D aiming guide
 */
export function computeTrajectoryPreview(
  fig: PlayerFigure,
  ball: BallState,
  angle: number,
  power: number,
  spinY: number
): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  let x = fig.x;
  let z = fig.z;
  const speed = 16 + power * 78;
  let vx = Math.cos(angle) * speed;
  let vz = Math.sin(angle) * speed;
  let activeSpin = spinY * 18;

  const dt = 0.035;
  for (let i = 0; i < 24; i++) {
    points.push({ x, z });
    const ax = -vz * activeSpin * 0.045;
    const az = vx * activeSpin * 0.045;
    vx += ax * dt;
    vz += az * dt;
    x += vx * dt;
    z += vz * dt;
    vx *= Math.exp(-2.1 * dt);
    vz *= Math.exp(-2.1 * dt);
    activeSpin *= Math.exp(-1.9 * dt);
    if (Math.hypot(vx, vz) < 1.5) break;
  }

  return points;
}
