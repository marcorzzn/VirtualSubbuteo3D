import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeTrajectoryPreview } from '../physics/subbuteoPhysics';
import {
  AccessibilitySettings,
  BallState,
  CameraViewMode,
  FISTF_PITCH,
  PlayerFigure,
  TeamId,
} from '../types/game';

// Pre-allocated math helpers at module scope (Zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _planeIntersect = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createPitchTexture(maxAnisotropy: number, highContrast: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1365;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;

  // Base baize / felt cloth background
  ctx.fillStyle = highContrast ? '#064e3b' : '#156534';
  ctx.fillRect(0, 0, w, h);

  // Subtle mowed turf bands across the 1200mm length
  const totalWidthUnits = FISTF_PITCH.LENGTH + FISTF_PITCH.BORDER_SURROUND * 2;
  const totalHeightUnits = FISTF_PITCH.WIDTH + FISTF_PITCH.BORDER_SURROUND * 2;
  const pxPerUnitX = w / totalWidthUnits;
  const pxPerUnitY = h / totalHeightUnits;

  const pitchLeft = FISTF_PITCH.BORDER_SURROUND * pxPerUnitX;
  const pitchTop = FISTF_PITCH.BORDER_SURROUND * pxPerUnitY;
  const pitchW = FISTF_PITCH.LENGTH * pxPerUnitX;
  const pitchH = FISTF_PITCH.WIDTH * pxPerUnitY;

  const numStripes = 12;
  const stripeW = pitchW / numStripes;
  for (let i = 0; i < numStripes; i++) {
    ctx.fillStyle =
      i % 2 === 0
        ? highContrast
          ? '#065f46'
          : '#18723b'
        : highContrast
          ? '#044332'
          : '#135e30';
    ctx.fillRect(pitchLeft + i * stripeW, pitchTop, stripeW, pitchH);
  }

  // Subtle felt weave grain
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }

  // Crisp FISTF regulatory markings
  ctx.strokeStyle = highContrast ? '#ffffff' : 'rgba(248, 250, 252, 0.92)';
  ctx.fillStyle = highContrast ? '#ffffff' : 'rgba(248, 250, 252, 0.92)';
  ctx.lineWidth = highContrast ? 6 : 4.5;

  // Outer touchlines & goal lines (1200mm x 750mm)
  ctx.strokeRect(pitchLeft, pitchTop, pitchW, pitchH);

  // Halfway line
  const centerX = w / 2;
  const centerY = h / 2;
  ctx.beginPath();
  ctx.moveTo(centerX, pitchTop);
  ctx.lineTo(centerX, pitchTop + pitchH);
  ctx.stroke();

  // Center circle (100mm radius)
  ctx.beginPath();
  ctx.arc(centerX, centerY, FISTF_PITCH.CENTER_CIRCLE_RADIUS * pxPerUnitX, 0, Math.PI * 2);
  ctx.stroke();

  // Center spot
  ctx.beginPath();
  ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
  ctx.fill();

  // FISTF 300mm Shooting Area Lines (distinctive amber/white dashed lines + solid ticks)
  const shootOffsetPx = FISTF_PITCH.SHOOTING_LINE_DIST * pxPerUnitX;
  ctx.save();
  ctx.strokeStyle = highContrast ? '#fde047' : 'rgba(253, 224, 71, 0.85)';
  ctx.lineWidth = highContrast ? 5 : 3.5;
  ctx.setLineDash([18, 12]);
  // Home shooting line (-30)
  ctx.beginPath();
  ctx.moveTo(pitchLeft + shootOffsetPx, pitchTop);
  ctx.lineTo(pitchLeft + shootOffsetPx, pitchTop + pitchH);
  ctx.stroke();
  // Away shooting line (+30)
  ctx.beginPath();
  ctx.moveTo(pitchLeft + pitchW - shootOffsetPx, pitchTop);
  ctx.lineTo(pitchLeft + pitchW - shootOffsetPx, pitchTop + pitchH);
  ctx.stroke();
  ctx.restore();

  // Penalty Areas (180mm x 400mm) & Goal Areas (60mm x 220mm)
  const penW = FISTF_PITCH.PENALTY_AREA_LENGTH * pxPerUnitX;
  const penH = FISTF_PITCH.PENALTY_AREA_WIDTH * pxPerUnitY;
  const goalAreaW = FISTF_PITCH.GOAL_AREA_LENGTH * pxPerUnitX;
  const goalAreaH = FISTF_PITCH.GOAL_AREA_WIDTH * pxPerUnitY;

  // Left (Home) Penalty & Goal Area
  ctx.strokeRect(pitchLeft, centerY - penH / 2, penW, penH);
  ctx.strokeRect(pitchLeft, centerY - goalAreaH / 2, goalAreaW, goalAreaH);

  // Right (Away) Penalty & Goal Area
  ctx.strokeRect(pitchLeft + pitchW - penW, centerY - penH / 2, penW, penH);
  ctx.strokeRect(pitchLeft + pitchW - goalAreaW, centerY - goalAreaH / 2, goalAreaW, goalAreaH);

  // Penalty Spots (120mm from goal line)
  const penSpotPx = FISTF_PITCH.PENALTY_SPOT_DIST * pxPerUnitX;
  ctx.beginPath();
  ctx.arc(pitchLeft + penSpotPx, centerY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pitchLeft + pitchW - penSpotPx, centerY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Corner arcs
  const cornerR = 3.2 * pxPerUnitX;
  const corners = [
    { x: pitchLeft, y: pitchTop, s: 0, e: Math.PI / 2 },
    { x: pitchLeft + pitchW, y: pitchTop, s: Math.PI / 2, e: Math.PI },
    { x: pitchLeft + pitchW, y: pitchTop + pitchH, s: Math.PI, e: (Math.PI * 3) / 2 },
    { x: pitchLeft, y: pitchTop + pitchH, s: (Math.PI * 3) / 2, e: Math.PI * 2 },
  ];
  corners.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, cornerR, c.s, c.e);
    ctx.stroke();
  });

  // Subtle FISTF surround markings on the apron
  ctx.font = '700 22px "Barlow Condensed", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.textAlign = 'center';
  ctx.fillText('FISTF OFFICIAL PITCH · 1200 × 750 MM', centerX, pitchTop * 0.55);
  ctx.fillText('AREA TIRO 300 MM', pitchLeft + shootOffsetPx, pitchTop + pitchH + pitchTop * 0.55);
  ctx.fillText('AREA TIRO 300 MM', pitchLeft + pitchW - shootOffsetPx, pitchTop + pitchH + pitchTop * 0.55);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createBallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 256);

  // Classic Subbuteo Tango / Pentagon patches
  ctx.fillStyle = '#0f172a';
  const spots = [
    { x: 64, y: 64, r: 28 },
    { x: 192, y: 64, r: 28 },
    { x: 320, y: 64, r: 28 },
    { x: 448, y: 64, r: 28 },
    { x: 128, y: 128, r: 32 },
    { x: 256, y: 128, r: 32 },
    { x: 384, y: 128, r: 32 },
    { x: 64, y: 192, r: 28 },
    { x: 192, y: 192, r: 28 },
    { x: 320, y: 192, r: 28 },
    { x: 448, y: 192, r: 28 },
  ];

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  spots.forEach((s) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const px = s.x + Math.cos(a) * s.r;
      const py = s.y + Math.sin(a) * s.r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createNumberDecalTexture(num: number, team: TeamId, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = team === 'home' ? '#eff6ff' : '#fef2f2';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = team === 'home' ? '#1d4ed8' : '#b91c1c';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 54px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 12, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/**
 * Assemble a 9-part composite procedural 3D Subbuteo Figure (THREE.Group)
 * Following the Three.js directive: never represent a hero actor with a single primitive.
 */
function buildCompositeSubbuteoFigure(
  fig: PlayerFigure,
  maxAnisotropy: number,
  shadowTex: THREE.CanvasTexture
): { root: THREE.Group; tiltPivot: THREE.Group; selectionRing: THREE.Mesh } {
  const root = new THREE.Group();
  root.userData = { figureId: fig.id, team: fig.team };

  // Soft contact shadow on the felt (offset Y = 0.025 to avoid Z-fighting)
  const shadowGeo = new THREE.PlaneGeometry(fig.radius * 2.5, fig.radius * 2.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.025;
  root.add(shadowMesh);

  // Selection / Eligible Halo Ring on ground
  const ringGeo = new THREE.RingGeometry(fig.radius * 1.12, fig.radius * 1.48, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: fig.team === 'home' ? 0x38bdf8 : 0xf87171,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.position.y = 0.04;
  root.add(selectionRing);

  // Tilt pivot for dynamic semi-spherical base wobble
  const tiltPivot = new THREE.Group();
  root.add(tiltPivot);

  // 1. Primary Silhouette: Weighted Semi-Spherical Acrylic Base Bowl (LatheGeometry)
  const points: THREE.Vector2[] = [];
  const r = fig.radius;
  const baseH = 0.72;
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(r * 0.48, 0.02)); // Flat bottom sliding bevel
  points.push(new THREE.Vector2(r * 0.85, baseH * 0.35));
  points.push(new THREE.Vector2(r, baseH * 0.85));
  points.push(new THREE.Vector2(r * 0.92, baseH));
  points.push(new THREE.Vector2(0, baseH));

  const baseGeo = new THREE.LatheGeometry(points, 28);
  const isHome = fig.team === 'home';
  const isGk = fig.role === 'GK';

  const baseColor = isGk
    ? isHome
      ? 0xf59e0b
      : 0x10b981
    : isHome
      ? 0x1d4ed8
      : 0xdc2626;

  const baseMat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    roughness: 0.16,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.userData = { figureId: fig.id };
  tiltPivot.add(baseMesh);

  // 2. Secondary Read: Inner Base Insert Collar with Number Decal
  const insertGeo = new THREE.CylinderGeometry(r * 0.76, r * 0.76, 0.14, 24);
  const numberTex = createNumberDecalTexture(fig.number, fig.team, maxAnisotropy);
  const insertSideMat = new THREE.MeshStandardMaterial({
    color: isHome ? 0xf8fafc : 0x1e293b,
    roughness: 0.45,
    metalness: 0.05,
  });
  const insertTopMat = new THREE.MeshStandardMaterial({
    map: numberTex,
    roughness: 0.38,
    metalness: 0.05,
  });
  const insertMesh = new THREE.Mesh(insertGeo, [insertSideMat, insertTopMat, insertSideMat]);
  insertMesh.position.y = baseH + 0.05;
  insertMesh.userData = { figureId: fig.id };
  tiltPivot.add(insertMesh);

  // 3. Moulded Support Peg
  const pegGeo = new THREE.CylinderGeometry(0.24, 0.32, 0.25, 16);
  const pegMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
  const pegMesh = new THREE.Mesh(pegGeo, pegMat);
  pegMesh.position.y = baseH + 0.2;
  pegMesh.userData = { figureId: fig.id };
  tiltPivot.add(pegMesh);

  // 4. Sculpted Boots & Socks
  const legsGroup = new THREE.Group();
  legsGroup.position.y = baseH + 0.32;
  const sockMat = new THREE.MeshStandardMaterial({
    color: isHome ? 0x1e3a8a : 0x991b1b,
    roughness: 0.65,
  });
  const legGeo = new THREE.CylinderGeometry(0.13, 0.11, 0.65, 12);
  const leftLeg = new THREE.Mesh(legGeo, sockMat);
  leftLeg.position.set(0, 0.32, -0.16);
  leftLeg.castShadow = true;
  leftLeg.userData = { figureId: fig.id };
  const rightLeg = new THREE.Mesh(legGeo, sockMat);
  rightLeg.position.set(0, 0.32, 0.16);
  rightLeg.castShadow = true;
  rightLeg.userData = { figureId: fig.id };
  legsGroup.add(leftLeg, rightLeg);
  tiltPivot.add(legsGroup);

  // 5. Classic Subbuteo Shorts
  const shortsGeo = new THREE.CylinderGeometry(0.36, 0.31, 0.42, 16);
  const shortsMat = new THREE.MeshStandardMaterial({
    color: isHome ? 0xffffff : 0x111827,
    roughness: 0.6,
  });
  const shortsMesh = new THREE.Mesh(shortsGeo, shortsMat);
  shortsMesh.position.y = baseH + 1.12;
  shortsMesh.castShadow = true;
  shortsMesh.userData = { figureId: fig.id };
  tiltPivot.add(shortsMesh);

  // 6. Jersey Torso
  const torsoGeo = new THREE.CylinderGeometry(0.42, 0.34, 0.78, 16);
  const jerseyColor = isGk
    ? isHome
      ? 0xfbbf24
      : 0x34d399
    : isHome
      ? 0x2563eb
      : 0xef4444;
  const torsoMat = new THREE.MeshStandardMaterial({
    color: jerseyColor,
    roughness: 0.52,
    metalness: 0.05,
  });
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.position.y = baseH + 1.68;
  torsoMesh.castShadow = true;
  torsoMesh.userData = { figureId: fig.id };
  tiltPivot.add(torsoMesh);

  // 7. Articulated Arms
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.48, 6, 10);
  const armLeft = new THREE.Mesh(armGeo, torsoMat);
  armLeft.position.set(0, baseH + 1.66, -0.48);
  armLeft.rotation.x = -0.22;
  armLeft.castShadow = true;
  armLeft.userData = { figureId: fig.id };
  const armRight = new THREE.Mesh(armGeo, torsoMat);
  armRight.position.set(0, baseH + 1.66, 0.48);
  armRight.rotation.x = 0.22;
  armRight.castShadow = true;
  armRight.userData = { figureId: fig.id };
  tiltPivot.add(armLeft, armRight);

  // 8. Head & Hair Accent
  const skinMat = new THREE.MeshStandardMaterial({
    color: fig.number % 3 === 0 ? 0xd99b72 : 0xf1c27d,
    roughness: 0.48,
  });
  const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.y = baseH + 2.32;
  headMesh.castShadow = true;
  headMesh.userData = { figureId: fig.id };
  tiltPivot.add(headMesh);

  const hairGeo = new THREE.SphereGeometry(0.29, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const hairMat = new THREE.MeshStandardMaterial({
    color: fig.number % 2 === 0 ? 0x1e1b18 : 0x78350f,
    roughness: 0.75,
  });
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.position.y = baseH + 2.34;
  hairMesh.rotation.z = -0.15;
  hairMesh.userData = { figureId: fig.id };
  tiltPivot.add(hairMesh);

  // 9. Goalkeeper Metallic Control Rod (Authentic Subbuteo GK Wire Handle)
  if (isGk) {
    const rodDir = isHome ? -1 : 1;
    const rodLen = 8.5;
    const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, rodLen, 10);
    rodGeo.rotateZ(Math.PI / 2);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.88,
      roughness: 0.2,
    });
    const rodMesh = new THREE.Mesh(rodGeo, rodMat);
    rodMesh.position.set((rodLen / 2) * rodDir, 0.35, 0);
    tiltPivot.add(rodMesh);

    const handleGeo = new THREE.CylinderGeometry(0.26, 0.22, 2.8, 14);
    handleGeo.rotateZ(Math.PI / 2);
    const handleMat = new THREE.MeshPhysicalMaterial({
      color: isHome ? 0x1d4ed8 : 0xdc2626,
      roughness: 0.25,
      clearcoat: 0.8,
    });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set((rodLen + 1.2) * rodDir, 0.35, 0);
    tiltPivot.add(handleMesh);
  }

  return { root, tiltPivot, selectionRing };
}

/**
 * Build realistic FISTF Goal Frame + Netting
 */
function buildFistfGoal(isLeftGoal: boolean): THREE.Group {
  const group = new THREE.Group();
  const sign = isLeftGoal ? -1 : 1;
  const goalHalfW = FISTF_PITCH.GOAL_WIDTH / 2;
  const depth = FISTF_PITCH.GOAL_DEPTH;
  const height = FISTF_PITCH.GOAL_HEIGHT;
  const postR = 0.28;

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.22,
    metalness: 0.15,
    clearcoat: 0.9,
  });

  // Left & Right Vertical Posts
  const postGeo = new THREE.CylinderGeometry(postR, postR, height, 16);
  const leftPost = new THREE.Mesh(postGeo, frameMat);
  leftPost.position.set(0, height / 2, -goalHalfW);
  leftPost.castShadow = true;
  const rightPost = new THREE.Mesh(postGeo, frameMat);
  rightPost.position.set(0, height / 2, goalHalfW);
  rightPost.castShadow = true;

  // Crossbar
  const barGeo = new THREE.CylinderGeometry(postR, postR, FISTF_PITCH.GOAL_WIDTH + postR * 2, 16);
  barGeo.rotateX(Math.PI / 2);
  const crossbar = new THREE.Mesh(barGeo, frameMat);
  crossbar.position.set(0, height, 0);
  crossbar.castShadow = true;

  // Back Stanchions
  const baseBarGeo = new THREE.CylinderGeometry(0.18, 0.18, depth, 12);
  baseBarGeo.rotateZ(Math.PI / 2);
  const leftBase = new THREE.Mesh(baseBarGeo, frameMat);
  leftBase.position.set((depth / 2) * sign, 0.18, -goalHalfW);
  const rightBase = new THREE.Mesh(baseBarGeo, frameMat);
  rightBase.position.set((depth / 2) * sign, 0.18, goalHalfW);

  const backBarGeo = new THREE.CylinderGeometry(0.18, 0.18, FISTF_PITCH.GOAL_WIDTH, 12);
  backBarGeo.rotateX(Math.PI / 2);
  const backBottomBar = new THREE.Mesh(backBarGeo, frameMat);
  backBottomBar.position.set(depth * sign, 0.18, 0);

  // Translucent Mesh Netting
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    wireframe: true,
    transparent: true,
    opacity: 0.42,
  });
  const backNetGeo = new THREE.PlaneGeometry(FISTF_PITCH.GOAL_WIDTH, height, 18, 10);
  backNetGeo.rotateY(Math.PI / 2);
  const backNet = new THREE.Mesh(backNetGeo, netMat);
  backNet.position.set(depth * sign, height / 2, 0);

  const topNetGeo = new THREE.PlaneGeometry(depth, FISTF_PITCH.GOAL_WIDTH, 8, 18);
  topNetGeo.rotateX(Math.PI / 2);
  const topNet = new THREE.Mesh(topNetGeo, netMat);
  topNet.position.set((depth / 2) * sign, height, 0);

  const sideNetGeo = new THREE.PlaneGeometry(depth, height, 8, 10);
  const sideNet1 = new THREE.Mesh(sideNetGeo, netMat);
  sideNet1.position.set((depth / 2) * sign, height / 2, -goalHalfW);
  const sideNet2 = new THREE.Mesh(sideNetGeo, netMat);
  sideNet2.position.set((depth / 2) * sign, height / 2, goalHalfW);

  group.add(
    leftPost,
    rightPost,
    crossbar,
    leftBase,
    rightBase,
    backBottomBar,
    backNet,
    topNet,
    sideNet1,
    sideNet2
  );
  group.position.set(FISTF_PITCH.HALF_L * sign, 0, 0);
  return group;
}

export interface SubbuteoSceneCallbacks {
  onSelectFigure: (figureId: string) => void;
  onAimChange: (angle: number, dragPower?: number) => void;
  onExecuteFlick: (angle: number, power: number) => void;
}

export class SubbuteoThreeController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private perspCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.Camera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;

  private figureMeshes = new Map<
    string,
    { root: THREE.Group; tiltPivot: THREE.Group; selectionRing: THREE.Mesh }
  >();
  private clickableProxies: THREE.Object3D[] = [];
  private ballGroup: THREE.Group;
  private ballMesh: THREE.Mesh;
  private pitchMesh!: THREE.Mesh;
  private maxAnisotropy: number;
  private shadowTex: THREE.CanvasTexture;

  // Aiming & Trajectory 3D Guide
  private trajectoryLine: THREE.Line;
  private aimArrowGroup: THREE.Group;
  private powerRingMesh: THREE.Mesh;

  // Camera state
  private cameraMode: CameraViewMode = CameraViewMode.HYBRID;
  private desiredCamPos = new THREE.Vector3(0, 72, 68);
  private desiredLookAt = new THREE.Vector3(0, 0, 0);
  private currentLookAt = new THREE.Vector3(0, 0, 0);
  private isTitleScreenOrbit = true;
  private titleOrbitAngle = 0;

  // Pointer interaction state
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private isDraggingFlick = false;
  private callbacks: SubbuteoSceneCallbacks;
  private selectedFigureId: string | null = null;
  private aimAngle = 0;
  private aimPower = 0.55;
  private aimSpinY = 0;
  private showTrajectory = true;

  public constructor(container: HTMLElement, callbacks: SubbuteoSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x090d16);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(0x090d16, 0.0028);

    // Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Cameras (Perspective for Hybrid/FPS/TV/Goal, Orthographic for True Isometric)
    this.perspCamera = new THREE.PerspectiveCamera(34, aspect, 0.5, 450);
    this.perspCamera.position.set(0, 74, 72);

    const frustumSize = 86;
    this.orthoCamera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.5,
      450
    );
    this.orthoCamera.position.set(65, 85, 65);
    this.orthoCamera.lookAt(0, 0, 0);

    this.activeCamera = this.perspCamera;

    this.controls = new OrbitControls(this.perspCamera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 190;
    this.controls.enabled = false; // Enabled in FREE_ORBIT or via right mouse drag

    this.shadowTex = createContactShadowTexture();

    this.setupLighting();
    this.setupTableAndPitch(false);

    // Ball Group (with contact shadow + textured sphere)
    this.ballGroup = new THREE.Group();
    const ballShadowGeo = new THREE.PlaneGeometry(FISTF_PITCH.BALL_RADIUS * 2.4, FISTF_PITCH.BALL_RADIUS * 2.4);
    ballShadowGeo.rotateX(-Math.PI / 2);
    const ballShadow = new THREE.Mesh(
      ballShadowGeo,
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    ballShadow.position.y = 0.03;
    this.ballGroup.add(ballShadow);

    const ballGeo = new THREE.SphereGeometry(FISTF_PITCH.BALL_RADIUS, 28, 28);
    const ballMat = new THREE.MeshPhysicalMaterial({
      map: createBallTexture(this.maxAnisotropy),
      roughness: 0.25,
      metalness: 0.04,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.position.y = FISTF_PITCH.BALL_RADIUS;
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    this.ballGroup.add(this.ballMesh);
    this.scene.add(this.ballGroup);

    // Trajectory Preview Line & Aiming Gizmo
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.12, 0),
      new THREE.Vector3(5, 0.12, 0),
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x34d399,
      dashSize: 1.2,
      gapSize: 0.6,
      transparent: true,
      opacity: 0.9,
    });
    this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.trajectoryLine.position.y = 0.12;
    this.scene.add(this.trajectoryLine);

    this.aimArrowGroup = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(0.65, 1.8, 16);
    coneGeo.rotateZ(-Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.position.set(3.2, 0.16, 0);
    this.aimArrowGroup.add(coneMesh);
    this.scene.add(this.aimArrowGroup);

    const pRingGeo = new THREE.RingGeometry(1.55, 2.0, 36);
    pRingGeo.rotateX(-Math.PI / 2);
    const pRingMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.powerRingMesh = new THREE.Mesh(pRingGeo, pRingMat);
    this.powerRingMesh.position.y = 0.06;
    this.scene.add(this.powerRingMesh);

    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.activeCamera);
    }
  }

  private setupLighting() {
    // Warm Directional Key Light (with tight shadow bounds covering the 120x75 pitch)
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
    keyLight.position.set(28, 88, 42);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 210;
    const d = 74;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Cool Sky / Warm Table Ground Hemisphere Fill
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x14532d, 0.85);
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    // Rim Light from opposite stadium side
    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.75);
    rimLight.position.set(-45, 52, -55);
    this.scene.add(rimLight);
  }

  private setupTableAndPitch(highContrast: boolean) {
    const totalW = FISTF_PITCH.LENGTH + FISTF_PITCH.BORDER_SURROUND * 2;
    const totalD = FISTF_PITCH.WIDTH + FISTF_PITCH.BORDER_SURROUND * 2;

    // Pitch Plane
    const pitchGeo = new THREE.PlaneGeometry(totalW, totalD);
    pitchGeo.rotateX(-Math.PI / 2);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: createPitchTexture(this.maxAnisotropy, highContrast),
      roughness: 0.88,
      metalness: 0.02,
    });
    this.pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    this.pitchMesh.receiveShadow = true;
    this.scene.add(this.pitchMesh);

    // Wooden Tournament Table Frame Surround (Astropitch wooden borders)
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0x451a03,
      roughness: 0.35,
      metalness: 0.08,
      clearcoat: 0.65,
    });
    const railThickness = 2.4;
    const railHeight = 2.2;

    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + railThickness * 2, railHeight, railThickness),
      railMat
    );
    topRail.position.set(0, railHeight / 2 - 0.3, -totalD / 2 - railThickness / 2);
    topRail.receiveShadow = true;

    const bottomRail = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + railThickness * 2, railHeight, railThickness),
      railMat
    );
    bottomRail.position.set(0, railHeight / 2 - 0.3, totalD / 2 + railThickness / 2);
    bottomRail.receiveShadow = true;

    const leftRail = new THREE.Mesh(
      new THREE.BoxGeometry(railThickness, railHeight, totalD),
      railMat
    );
    leftRail.position.set(-totalW / 2 - railThickness / 2, railHeight / 2 - 0.3, 0);
    leftRail.receiveShadow = true;

    const rightRail = new THREE.Mesh(
      new THREE.BoxGeometry(railThickness, railHeight, totalD),
      railMat
    );
    rightRail.position.set(totalW / 2 + railThickness / 2, railHeight / 2 - 0.3, 0);
    rightRail.receiveShadow = true;

    // Dark Arena Floor beneath the Subbuteo table
    const arenaFloorGeo = new THREE.PlaneGeometry(500, 500);
    arenaFloorGeo.rotateX(-Math.PI / 2);
    const arenaFloorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.92,
    });
    const arenaFloor = new THREE.Mesh(arenaFloorGeo, arenaFloorMat);
    arenaFloor.position.y = -3.5;
    this.scene.add(topRail, bottomRail, leftRail, rightRail, arenaFloor);

    // Both FISTF Goals
    this.scene.add(buildFistfGoal(true));
    this.scene.add(buildFistfGoal(false));
  }

  public setHighContrastPitch(highContrast: boolean) {
    if (!this.pitchMesh) return;
    const mat = this.pitchMesh.material as THREE.MeshStandardMaterial;
    if (mat.map) mat.map.dispose();
    mat.map = createPitchTexture(this.maxAnisotropy, highContrast);
    mat.needsUpdate = true;
  }

  public syncFiguresAndBall(
    figures: PlayerFigure[],
    ball: BallState,
    selectedFigureId: string | null,
    eligibleTeam: TeamId,
    aimAngle: number,
    aimPower: number,
    aimSpinY: number,
    accessibility: AccessibilitySettings
  ) {
    this.selectedFigureId = selectedFigureId;
    this.aimAngle = aimAngle;
    this.aimPower = aimPower;
    this.aimSpinY = aimSpinY;
    this.showTrajectory = accessibility.showTrajectoryGuide;

    // Create or update figure meshes
    for (const f of figures) {
      let entry = this.figureMeshes.get(f.id);
      if (!entry) {
        entry = buildCompositeSubbuteoFigure(f, this.maxAnisotropy, this.shadowTex);
        this.figureMeshes.set(f.id, entry);
        this.scene.add(entry.root);
        this.clickableProxies.push(entry.tiltPivot);
      }

      entry.root.position.set(f.x, 0, f.z);
      entry.tiltPivot.rotation.set(f.tiltX, -f.facing, f.tiltZ, 'YXZ');

      // Highlight selected or eligible figures
      const ringMat = entry.selectionRing.material as THREE.MeshBasicMaterial;
      if (f.id === selectedFigureId) {
        ringMat.color.setHex(0x10b981);
        ringMat.opacity = 0.95;
        entry.selectionRing.scale.setScalar(1.18);
      } else if (f.team === eligibleTeam && f.flickCount < FISTF_PITCH.MAX_FIGURE_FLICKS) {
        ringMat.color.setHex(f.team === 'home' ? 0x38bdf8 : 0xf87171);
        ringMat.opacity = 0.35;
        entry.selectionRing.scale.setScalar(1.0);
      } else {
        ringMat.opacity = 0.0;
      }
    }

    // Update Ball
    const prevX = this.ballGroup.position.x;
    const prevZ = this.ballGroup.position.z;
    this.ballGroup.position.set(ball.x, 0, ball.z);

    // Visual rolling rotation of ball
    const dx = ball.x - prevX;
    const dz = ball.z - prevZ;
    this.ballMesh.rotation.z -= dx / FISTF_PITCH.BALL_RADIUS;
    this.ballMesh.rotation.x += dz / FISTF_PITCH.BALL_RADIUS;
    this.ballMesh.rotation.y += ball.spinY * 0.015;

    // Update Aiming Gizmo & Curved Trajectory Preview
    const selectedFig = figures.find((f) => f.id === selectedFigureId);
    if (selectedFig && this.showTrajectory && !this.isTitleScreenOrbit) {
      this.trajectoryLine.visible = true;
      this.aimArrowGroup.visible = true;
      this.powerRingMesh.visible = true;

      this.aimArrowGroup.position.set(selectedFig.x, 0, selectedFig.z);
      this.aimArrowGroup.rotation.y = -aimAngle;

      this.powerRingMesh.position.set(selectedFig.x, 0.06, selectedFig.z);
      this.powerRingMesh.scale.setScalar(0.85 + aimPower * 0.95);
      const pMat = this.powerRingMesh.material as THREE.MeshBasicMaterial;
      if (aimPower < 0.45) pMat.color.setHex(0x10b981);
      else if (aimPower < 0.78) pMat.color.setHex(0xf59e0b);
      else pMat.color.setHex(0xef4444);

      const pts = computeTrajectoryPreview(selectedFig, ball, aimAngle, aimPower, aimSpinY);
      const vecPts = pts.map((p) => new THREE.Vector3(p.x, 0.14, p.z));
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(vecPts);
      this.trajectoryLine.computeLineDistances();
    } else {
      this.trajectoryLine.visible = false;
      this.aimArrowGroup.visible = false;
      this.powerRingMesh.visible = false;
    }
  }

  public setCameraMode(mode: CameraViewMode) {
    this.cameraMode = mode;
    if (mode === CameraViewMode.ISOMETRIC) {
      this.activeCamera = this.orthoCamera;
      this.controls.enabled = false;
    } else if (mode === CameraViewMode.FREE_ORBIT) {
      this.activeCamera = this.perspCamera;
      this.perspCamera.fov = 38;
      this.perspCamera.updateProjectionMatrix();
      this.controls.enabled = true;
    } else {
      this.activeCamera = this.perspCamera;
      this.controls.enabled = false;
      if (mode === CameraViewMode.HYBRID) {
        this.perspCamera.fov = 33;
      } else if (mode === CameraViewMode.FPS_PLAYER) {
        this.perspCamera.fov = 52;
      } else if (mode === CameraViewMode.BROADCAST) {
        this.perspCamera.fov = 36;
      } else if (mode === CameraViewMode.GOAL_CAM) {
        this.perspCamera.fov = 45;
      }
      this.perspCamera.updateProjectionMatrix();
    }
  }

  public setTitleScreenOrbit(active: boolean) {
    this.isTitleScreenOrbit = active;
  }

  public updateCameraRig(
    dt: number,
    figures: PlayerFigure[],
    ball: BallState,
    activeTeam: TeamId,
    reducedMotion: boolean
  ) {
    if (this.isTitleScreenOrbit) {
      this.activeCamera = this.perspCamera;
      this.titleOrbitAngle += dt * (reducedMotion ? 0.04 : 0.16);
      const radius = 84;
      this.perspCamera.position.set(
        Math.cos(this.titleOrbitAngle) * radius,
        48,
        Math.sin(this.titleOrbitAngle) * radius
      );
      this.perspCamera.lookAt(0, 0, 0);
      return;
    }

    if (this.cameraMode === CameraViewMode.FREE_ORBIT) {
      this.controls.update();
      return;
    }

    if (this.cameraMode === CameraViewMode.ISOMETRIC) {
      this.orthoCamera.position.set(ball.x * 0.25 + 62, 88, ball.z * 0.25 + 62);
      this.orthoCamera.lookAt(ball.x * 0.25, 0, ball.z * 0.25);
      return;
    }

    const selectedFig = figures.find((f) => f.id === this.selectedFigureId);

    if (this.cameraMode === CameraViewMode.FPS_PLAYER && selectedFig) {
      // Halfway between FPS behind the figure's shoulders and low table view
      const distBehind = 12.5;
      const height = 7.2;
      this.desiredCamPos.set(
        selectedFig.x - Math.cos(this.aimAngle) * distBehind,
        height,
        selectedFig.z - Math.sin(this.aimAngle) * distBehind
      );
      this.desiredLookAt.set(
        selectedFig.x + Math.cos(this.aimAngle) * 18,
        1.2,
        selectedFig.z + Math.sin(this.aimAngle) * 18
      );
    } else if (this.cameraMode === CameraViewMode.HYBRID) {
      // Hybrid perspective between FPS immersion and Isometric tactical board overview
      const focusX = selectedFig ? (selectedFig.x + ball.x) * 0.42 : ball.x * 0.45;
      const focusZ = selectedFig ? (selectedFig.z + ball.z) * 0.42 : ball.z * 0.45;
      this.desiredCamPos.set(focusX, 54, focusZ + 58);
      this.desiredLookAt.set(focusX, 0, focusZ * 0.5);
    } else if (this.cameraMode === CameraViewMode.BROADCAST) {
      this.desiredCamPos.set(ball.x * 0.65, 44, 66);
      this.desiredLookAt.set(ball.x * 0.75, 0.8, ball.z * 0.55);
    } else if (this.cameraMode === CameraViewMode.GOAL_CAM) {
      const targetSide = activeTeam === 'home' ? 1 : -1;
      this.desiredCamPos.set((FISTF_PITCH.HALF_L + 22) * targetSide, 19, ball.z * 0.35);
      this.desiredLookAt.set(ball.x * 0.5, 1.5, ball.z * 0.5);
    }

    const lambda = reducedMotion ? 18 : 6.5;
    this.perspCamera.position.x = THREE.MathUtils.damp(
      this.perspCamera.position.x,
      this.desiredCamPos.x,
      lambda,
      dt
    );
    this.perspCamera.position.y = THREE.MathUtils.damp(
      this.perspCamera.position.y,
      this.desiredCamPos.y,
      lambda,
      dt
    );
    this.perspCamera.position.z = THREE.MathUtils.damp(
      this.perspCamera.position.z,
      this.desiredCamPos.z,
      lambda,
      dt
    );

    this.currentLookAt.x = THREE.MathUtils.damp(
      this.currentLookAt.x,
      this.desiredLookAt.x,
      lambda,
      dt
    );
    this.currentLookAt.y = THREE.MathUtils.damp(
      this.currentLookAt.y,
      this.desiredLookAt.y,
      lambda,
      dt
    );
    this.currentLookAt.z = THREE.MathUtils.damp(
      this.currentLookAt.z,
      this.desiredLookAt.z,
      lambda,
      dt
    );

    this.perspCamera.lookAt(this.currentLookAt);
  }

  public renderFrame() {
    this.renderer.render(this.scene, this.activeCamera);
  }

  public getIsSoftwareGl(): boolean {
    return this.isSoftwareGl;
  }

  public getRendererContext(): WebGL2RenderingContext {
    return this.renderer.getContext() as WebGL2RenderingContext;
  }

  private updateNormalizedMouse(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (this.isTitleScreenOrbit || e.button !== 0) return;
      this.updateNormalizedMouse(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.mouse, this.activeCamera);

      // Check if clicking on a figure
      const hits = this.raycaster.intersectObjects(this.clickableProxies, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.figureId) {
          obj = obj.parent;
        }
        if (obj?.userData?.figureId) {
          this.callbacks.onSelectFigure(obj.userData.figureId);
          if (this.cameraMode !== CameraViewMode.FREE_ORBIT) {
            this.isDraggingFlick = true;
          }
          return;
        }
      }

      // Or if a figure is already selected and clicking on the pitch to aim & shoot
      if (this.selectedFigureId && this.cameraMode !== CameraViewMode.FREE_ORBIT) {
        const hitGround = this.raycaster.ray.intersectPlane(_groundPlane, _planeIntersect);
        if (hitGround) {
          const entry = this.figureMeshes.get(this.selectedFigureId);
          if (entry) {
            const dx = _planeIntersect.x - entry.root.position.x;
            const dz = _planeIntersect.z - entry.root.position.z;
            const angle = Math.atan2(dz, dx);
            this.callbacks.onAimChange(angle);
            this.isDraggingFlick = true;
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.isTitleScreenOrbit || !this.selectedFigureId || this.cameraMode === CameraViewMode.FREE_ORBIT)
        return;
      if (!this.isDraggingFlick) return;

      this.updateNormalizedMouse(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.mouse, this.activeCamera);
      const hitGround = this.raycaster.ray.intersectPlane(_groundPlane, _planeIntersect);

      if (hitGround) {
        const entry = this.figureMeshes.get(this.selectedFigureId);
        if (entry) {
          const dx = _planeIntersect.x - entry.root.position.x;
          const dz = _planeIntersect.z - entry.root.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.4) {
            const angle = Math.atan2(dz, dx);
            const dragPower = Math.max(0.12, Math.min(1.0, dist / 28));
            this.callbacks.onAimChange(angle, dragPower);
          }
        }
      }
    };

    const onPointerUp = () => {
      if (this.isDraggingFlick) {
        this.isDraggingFlick = false;
      }
    };

    const onResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      const aspect = w / h;

      this.perspCamera.aspect = aspect;
      this.perspCamera.updateProjectionMatrix();

      const frustumSize = 86;
      this.orthoCamera.left = (frustumSize * aspect) / -2;
      this.orthoCamera.right = (frustumSize * aspect) / 2;
      this.orthoCamera.top = frustumSize / 2;
      this.orthoCamera.bottom = frustumSize / -2;
      this.orthoCamera.updateProjectionMatrix();

      this.renderer.setSize(w, h);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);

    this.cleanupListeners = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }

  private cleanupListeners: () => void = () => {};

  public dispose() {
    this.cleanupListeners();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
