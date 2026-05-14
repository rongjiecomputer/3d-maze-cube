import './style.css';
import * as THREE from 'three';
// @ts-ignore
import { WebGPURenderer } from 'three/webgpu';
import { HollowMaze3D } from './maze';
// @ts-ignore
import * as RAPIER from '@dimforge/rapier3d';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

async function init() {
  // --- UI Setup ---
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `
    <div id="startOverlay" class="overlay">
      <h2>3D MAZE CUBE</h2>
      <button id="startBtn" class="btn-start">START GAME</button>
      <p class="mobile-hint">DESKTOP: WASD to Tilt • Drag to Orbit<br>MOBILE: Tilt Device to Roll • Swipe to Orbit</p>
    </div>

    <div class="ui">
      <h1>3D MAZE CUBE</h1>
      <p>WEBGPU POWERED PHYSICS MAZE</p>
      
      <div class="controls">
        <div class="control-item">
          <label for="zoomRange">ZOOM</label>
          <input type="range" id="zoomRange" min="5" max="25" step="0.1" value="12">
        </div>
      </div>
    </div>
    <div class="instructions">DRAG TO ORBIT • SCROLL TO ZOOM</div>
  `;

  // --- Rapier Physics Setup ---
  // @ts-ignore
  if (RAPIER.init) {
    // @ts-ignore
    await RAPIER.init();
  }
  const gravity = { x: 0.0, y: -20.0, z: 0.0 };
  // @ts-ignore
  const world = new RAPIER.World(gravity);

  // --- Three.js Setup ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 12);

  // @ts-ignore
  const renderer = new WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // @ts-ignore
  await renderer.init();
  app.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  // --- Maze Creation ---
  const mazeSize = 5;
  const cellSize = 2;
  const wallThickness = 0.2;
  const maze = new HollowMaze3D(mazeSize);

  const mazeGroup = new THREE.Group();
  scene.add(mazeGroup);

  // Kinematic body for the whole maze
  const mazeBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
  const mazeBody = world.createRigidBody(mazeBodyDesc);

  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x44ff44, 
    roughness: 0.3,
    metalness: 0.2
  });

  const offset = -(mazeSize * cellSize) / 2 + cellSize / 2;

  function addWall(px: number, py: number, pz: number, size: [number, number, number]) {
    const geometry = new THREE.BoxGeometry(...size);
    // Clone material so we can fade walls independently
    const mesh = new THREE.Mesh(geometry, wallMaterial.clone());
    mesh.position.set(px, py, pz);
    mazeGroup.add(mesh);

    // Rapier collider
    const colliderDesc = RAPIER.ColliderDesc.cuboid(size[0]/2, size[1]/2, size[2]/2);
    colliderDesc.setTranslation(px, py, pz);
    world.createCollider(colliderDesc, mazeBody);
  }

  // Create walls
  maze.grid.forEach((layer, x) => {
    layer.forEach((row, y) => {
      row.forEach((cell, z) => {
        const posX = offset + x * cellSize;
        const posY = offset + y * cellSize;
        const posZ = offset + z * cellSize;

        // Right wall (+x)
        if (cell.walls.right && x < mazeSize - 1) {
          addWall(posX + cellSize/2, posY, posZ, [wallThickness, cellSize, cellSize]);
        }
        // Top wall (+y)
        if (cell.walls.top && y < mazeSize - 1) {
          addWall(posX, posY + cellSize/2, posZ, [cellSize, wallThickness, cellSize]);
        }
        // Front wall (+z)
        if (cell.walls.front && z < mazeSize - 1) {
          addWall(posX, posY, posZ + cellSize/2, [cellSize, cellSize, wallThickness]);
        }
      });
    });
  });

  // Translucent Outer Cube
  const outerSize = mazeSize * cellSize + wallThickness;
  const outerGeo = new THREE.BoxGeometry(outerSize, outerSize, outerSize);
  const outerMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.15,
    transmission: 0.5,
    roughness: 0.05,
    thickness: 0.5,
    metalness: 0.1
  });
  const outerCube = new THREE.Mesh(outerGeo, outerMat);
  mazeGroup.add(outerCube);

  // Add outer boundary colliders (Rapier)
  const outerColliderDesc = [
    RAPIER.ColliderDesc.cuboid(outerSize/2, wallThickness/2, outerSize/2).setTranslation(0, outerSize/2, 0),
    RAPIER.ColliderDesc.cuboid(outerSize/2, wallThickness/2, outerSize/2).setTranslation(0, -outerSize/2, 0),
    RAPIER.ColliderDesc.cuboid(wallThickness/2, outerSize/2, outerSize/2).setTranslation(outerSize/2, 0, 0),
    RAPIER.ColliderDesc.cuboid(wallThickness/2, outerSize/2, outerSize/2).setTranslation(-outerSize/2, 0, 0),
    RAPIER.ColliderDesc.cuboid(outerSize/2, outerSize/2, wallThickness/2).setTranslation(0, 0, outerSize/2),
    RAPIER.ColliderDesc.cuboid(outerSize/2, outerSize/2, wallThickness/2).setTranslation(0, 0, -outerSize/2),
  ];
  outerColliderDesc.forEach(desc => world.createCollider(desc, mazeBody));

  // --- Ball Creation ---
  const ballRadius = 0.4;
  const ballGeo = new THREE.SphereGeometry(ballRadius, 32, 32);
  const ballMat = new THREE.MeshStandardMaterial({ 
    color: 0x8888ff, 
    metalness: 0.9, 
    roughness: 0.1 
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  scene.add(ballMesh);

  const ballBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(offset, offset, offset)
    .setCanSleep(false);
  const ballBody = world.createRigidBody(ballBodyDesc);
  const ballColliderDesc = RAPIER.ColliderDesc.ball(ballRadius)
    .setRestitution(0.0)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
  world.createCollider(ballColliderDesc, ballBody);

  // --- X-Ray Silhouette ---
  const ballSilhouetteMat = new THREE.MeshBasicMaterial({ 
    color: 0x00f2fe, 
    transparent: true,
    opacity: 0.5,
    depthFunc: THREE.GreaterDepth, 
    depthWrite: false 
  });
  const ballSilhouetteMesh = new THREE.Mesh(ballGeo, ballSilhouetteMat);
  scene.add(ballSilhouetteMesh);

  // --- Controls & Interaction ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.8;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 25;

  const targetQuaternion = new THREE.Quaternion();
  const currentTilt = { x: 0, z: 0 };
  const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

  window.addEventListener('keydown', (e) => {
    if (e.key in keys) keys[e.key as keyof typeof keys] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key in keys) keys[e.key as keyof typeof keys] = false;
  });

  // Device Orientation for Mobile
  let useGyro = false;
  const startOverlay = document.querySelector<HTMLDivElement>('#startOverlay')!;
  const startBtn = document.querySelector<HTMLButtonElement>('#startBtn')!;

  startBtn.addEventListener('click', async () => {
    // Request permission for iOS
    // @ts-ignore
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        // @ts-ignore
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') useGyro = true;
      } catch (err) {
        console.error(err);
      }
    } else {
      useGyro = true; // Non-iOS or older devices
    }
    
    startOverlay.classList.add('hidden');
  });

  window.addEventListener('deviceorientation', (e) => {
    if (!useGyro) return;
    // Map beta (-180 to 180) and gamma (-90 to 90) to tilt
    // We'll use a sensitivity factor
    const sens = 0.02;
    currentTilt.x = (e.beta || 0) * sens;
    currentTilt.z = -(e.gamma || 0) * sens;
  });

  // --- Visibility Logic Helpers ---
  const raycaster = new THREE.Raycaster();

  function updateVisibility() {
    // 1. Raycast for transparency (Ball obstruction)
    const direction = new THREE.Vector3().subVectors(ballMesh.position, camera.position).normalize();
    raycaster.set(camera.position, direction);

    // 2. Front-face fading (Outer faces)
    // We'll also fade walls that are simply facing the camera to keep the "front" open
    /*const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    const intersects = raycaster.intersectObjects(mazeGroup.children, true);
    const toBallDist = camera.position.distanceTo(ballMesh.position);

    mazeGroup.children.forEach(obj => {
      if (!(obj instanceof THREE.Mesh) || obj === outerCube) return;
      
      const mat = obj.material as THREE.MeshStandardMaterial;
      let targetOpacity = 1.0;

      // Check if it blocks the ball
      const isBlocking = intersects.some(intersect => intersect.object === obj && intersect.distance < toBallDist);
      
      // Check if it's a front-facing wall (using dot product of normal and camera direction)
      // For a box, we can just check if it's on the "near" side of the cube
      const localPos = obj.position.clone();
      const worldPos = obj.localToWorld(localPos.clone());
      const toCamera = new THREE.Vector3().subVectors(camera.position, worldPos).normalize();
      
      // If the wall is between the camera and the center of the maze and facing camera
      const isFront = toCamera.dot(worldPos.normalize()) > 0.5;

      if (isBlocking) {
        targetOpacity = 0.1;
      } else if (isFront) {
        targetOpacity = 0.3;
      }

      mat.transparent = targetOpacity < 1.0;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.1);
    });*/

    /*// 3. Camera Auto-Follow
    // If the ball is moving towards a face that's hidden or far, gently orbit
    const ballPos = ballMesh.position.clone();
    const ballDist = ballPos.length();
    if (ballDist > 1) { // Only follow if ball isn't at the very center
      const idealCameraDir = ballPos.clone().normalize();
      const currentCameraDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      
      // If the angle between ball and camera is too large, nudge the camera
      if (idealCameraDir.angleTo(currentCameraDir) > Math.PI / 2.5) {
        const followSpeed = 0.005;
        const targetPos = idealCameraDir.multiplyScalar(camera.position.length());
        camera.position.lerp(targetPos, followSpeed);
      }
    }*/
  }

  const zoomRange = document.querySelector<HTMLInputElement>('#zoomRange')!;
  zoomRange.addEventListener('input', (e) => {
    controls.object.position.setLength(parseFloat((e.target as HTMLInputElement).value));
  });

  // --- Stats.js Setup ---
  const stats = new Stats();
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  stats.dom.style.position = 'absolute';
  stats.dom.style.top = '2rem';
  stats.dom.style.right = '2rem';
  stats.dom.style.left = 'auto'; // Reset default left
  stats.dom.style.display = 'none';
  document.body.appendChild(stats.dom);

  // --- Debug Toggle ---
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'd') {
      const isHidden = stats.dom.style.display === 'none';
      stats.dom.style.display = isHidden ? 'block' : 'none';
    }
  });

  // --- Animation Loop ---
  function animate() {
    requestAnimationFrame(animate);

    // Update Maze Tilt from Keyboard
    const tiltSpeed = 0.02;
    if (keys.w || keys.ArrowUp) currentTilt.x -= tiltSpeed;
    if (keys.s || keys.ArrowDown) currentTilt.x += tiltSpeed;
    if (keys.a || keys.ArrowLeft) currentTilt.z -= tiltSpeed;
    if (keys.d || keys.ArrowRight) currentTilt.z += tiltSpeed;

    // Apply limits and damping to tilt
    currentTilt.x = THREE.MathUtils.clamp(currentTilt.x, -0.5, 0.5);
    currentTilt.z = THREE.MathUtils.clamp(currentTilt.z, -0.5, 0.5);
    
    // Smoothly return to 0 if no keys pressed AND not using gyro
    if (!useGyro) {
      if (!keys.w && !keys.s && !keys.ArrowUp && !keys.ArrowDown) currentTilt.x *= 0.9;
      if (!keys.a && !keys.d && !keys.ArrowLeft && !keys.ArrowRight) currentTilt.z *= 0.9;
    }

    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), currentTilt.x);
    const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), currentTilt.z);
    targetQuaternion.copy(qX).multiply(qZ);

    // Update Maze Rotation
    mazeGroup.quaternion.slerp(targetQuaternion, 0.1);

    // Sync Rapier Kinematic Body
    mazeBody.setNextKinematicRotation(mazeGroup.quaternion);
    
    // Step Physics
    world.step();

    // Sync Ball
    const ballPos = ballBody.translation();
    const ballRot = ballBody.rotation();
    ballMesh.position.set(ballPos.x, ballPos.y, ballPos.z);
    ballMesh.quaternion.set(ballRot.x, ballRot.y, ballRot.z, ballRot.w);

    // Sync Silhouette
    ballSilhouetteMesh.position.copy(ballMesh.position);

    // Visibility Tricks
    updateVisibility();

    controls.update();
    renderer.render(scene, camera);
    stats.update();

    // Sync Zoom UI
    zoomRange.value = camera.position.length().toString();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

init();
