import './style.css';
import * as THREE from 'three';
import * as Tone from 'tone';
// @ts-ignore
import { WebGPURenderer } from 'three/webgpu';
import { HollowMaze3D } from './maze';
// @ts-ignore
import * as RAPIER from '@dimforge/rapier3d';
import Stats from 'stats.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

async function init() {
  // --- UI Setup ---
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const urlParams = new URLSearchParams(window.location.search);
  const sizeParam = urlParams.get('size');

  if (!sizeParam) {
    app.innerHTML = `
      <div class="start-screen">
        <div class="start-content">
          <h1>3D MAZE CUBE</h1>
          <p>CHOOSE YOUR MAZE SIZE</p>
          <div class="control-item">
            <label for="startSize">MAZE SIZE: <span id="sizeValue">5</span></label>
            <input type="range" id="startSize" min="3" max="8" step="1" value="5" style="width: 250px;">
          </div>
          <button id="startBtn" class="btn">START GAME</button>
        </div>
      </div>
    `;

    const startSize = document.querySelector<HTMLInputElement>('#startSize')!;
    const sizeValue = document.querySelector<HTMLSpanElement>('#sizeValue')!;
    const startBtn = document.querySelector<HTMLButtonElement>('#startBtn')!;

    startSize.addEventListener('input', () => {
      sizeValue.textContent = startSize.value;
    });

    startBtn.addEventListener('click', () => {
      window.location.search = `?size=${startSize.value}`;
    });

    return;
  }

  const mazeSize = parseInt(sizeParam);

  app.innerHTML = `
    <div class="ui">
      <h1>3D MAZE CUBE</h1>
      <p>WEBGPU POWERED PHYSICS MAZE</p>
      
      <div class="controls">
        <div class="control-item">
          <label for="zoomRange">ZOOM</label>
          <input type="range" id="zoomRange" step="0.1">
        </div>
        <div class="control-item">
          <label for="mazeSizeRange">MAZE SIZE: ${mazeSize}</label>
          <input type="range" id="mazeSizeRange" min="3" max="8" step="1" value="${mazeSize}">
        </div>
        <div class="control-item">
          <button id="audioToggle" class="toggle-btn active">AUDIO: ON</button>
        </div>
      </div>
    </div>
    <div class="instructions">DRAG TO ROTATE • SCROLL TO ZOOM</div>
  `;

  // --- Rapier Physics Setup ---
  // @ts-ignore
  if (RAPIER.init) {
    // @ts-ignore
    await RAPIER.init();
  }
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  // @ts-ignore
  const world = new RAPIER.World(gravity);
  world.integrationParameters.maxCcdSubsteps = 5;
  const eventQueue = new RAPIER.EventQueue(true);

  // --- Audio Setup ---
  const metalThud = new Tone.MetalSynth({
    envelope: {
      attack: 0.001,
      decay: 0.1,
      release: 0.1
    },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 800,
    octaves: 1.5
  }).toDestination();
  metalThud.volume.value = -12;

  let audioStarted = false;
  let audioEnabled = localStorage.getItem('audioEnabled') !== 'false';

  const audioToggle = document.querySelector<HTMLButtonElement>('#audioToggle')!;
  audioToggle.textContent = `AUDIO: ${audioEnabled ? 'ON' : 'OFF'}`;
  audioToggle.classList.toggle('active', audioEnabled);

  audioToggle.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    localStorage.setItem('audioEnabled', audioEnabled.toString());
    audioToggle.textContent = `AUDIO: ${audioEnabled ? 'ON' : 'OFF'}`;
    audioToggle.classList.toggle('active', audioEnabled);
    
    if (audioEnabled && !audioStarted) {
      Tone.start().then(() => {
        audioStarted = true;
      });
    }
  });

  window.addEventListener('pointerdown', async () => {
    if (audioEnabled && !audioStarted) {
      await Tone.start();
      audioStarted = true;
    }
  });

  // --- Three.js Setup ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const cellSize = 2;
  const wallThickness = 0.2;
  const outerSize = mazeSize * cellSize + wallThickness;
  const targetScreenHeightFrac = 0.6;
  const fov = 75;
  const initialZoom = outerSize / targetScreenHeightFrac;

  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, initialZoom);

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

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight2.position.set(0, 10, 0);
  scene.add(dirLight2);

  // --- Maze Creation ---
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
    const mesh = new THREE.Mesh(geometry, wallMaterial);
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
  // We make these much thicker than the visual walls to prevent tunneling at high speeds
  const bThick = 5.0; 
  const bOffset = bThick/2 - wallThickness/2;
  const hSize = outerSize/2;

  const outerColliderDesc = [
    // Overlap the dimensions (hSize + bThick) to ensure corners are perfectly sealed
    RAPIER.ColliderDesc.cuboid(hSize + bThick, bThick/2, hSize + bThick).setTranslation(0, hSize + bOffset, 0),
    RAPIER.ColliderDesc.cuboid(hSize + bThick, bThick/2, hSize + bThick).setTranslation(0, -(hSize + bOffset), 0),
    RAPIER.ColliderDesc.cuboid(bThick/2, hSize + bThick, hSize + bThick).setTranslation(hSize + bOffset, 0, 0),
    RAPIER.ColliderDesc.cuboid(bThick/2, hSize + bThick, hSize + bThick).setTranslation(-(hSize + bOffset), 0, 0),
    RAPIER.ColliderDesc.cuboid(hSize + bThick, hSize + bThick, bThick/2).setTranslation(0, 0, hSize + bOffset),
    RAPIER.ColliderDesc.cuboid(hSize + bThick, hSize + bThick, bThick/2).setTranslation(0, 0, -(hSize + bOffset)),
  ];
  outerColliderDesc.forEach(desc => world.createCollider(desc, mazeBody));

  // --- Ball Creation ---
  const ballRadius = 0.8;
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
    .setCanSleep(false)
    .setLinearDamping(0.3)
    .setAngularDamping(1.0)
    .setCcdEnabled(true);
  const ballBody = world.createRigidBody(ballBodyDesc);
  const ballColliderDesc = RAPIER.ColliderDesc.ball(ballRadius)
    .setDensity(7000.0)
    .setRestitution(0.0)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
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

  // --- Interaction (Virtual Trackball) ---
  const proxyCamera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  proxyCamera.position.set(0, 0, initialZoom);
  
  const controls = new TrackballControls(proxyCamera, renderer.domElement);
  controls.rotateSpeed = 3.0;
  controls.zoomSpeed = 1.2;
  controls.noZoom = false;
  controls.noPan = true;
  controls.dynamicDampingFactor = 0.3;

  // --- Visibility Logic Helpers ---
  const raycaster = new THREE.Raycaster();

  function updateVisibility() {
    // 1. Raycast for transparency (Ball obstruction)
    const direction = new THREE.Vector3().subVectors(ballMesh.position, camera.position).normalize();
    raycaster.set(camera.position, direction);
  }

  // Sync zoom slider with controls
  const zoomRange = document.querySelector<HTMLInputElement>('#zoomRange')!;
  zoomRange.min = (initialZoom * 0.4).toFixed(1);
  zoomRange.max = (initialZoom * 2.5).toFixed(1);
  zoomRange.value = initialZoom.toFixed(1);
  
  const updateZoom = (value: number) => {
    proxyCamera.position.normalize().multiplyScalar(value);
    zoomRange.value = value.toString();
  };

  zoomRange.addEventListener('input', (e) => {
    updateZoom(parseFloat((e.target as HTMLInputElement).value));
  });

  const mazeSizeRange = document.querySelector<HTMLInputElement>('#mazeSizeRange')!;
  mazeSizeRange.addEventListener('change', (e) => {
    const newSize = (e.target as HTMLInputElement).value;
    if (newSize !== mazeSize.toString()) {
      const confirmRestart = confirm("Changing maze size will restart the game. Proceed?");
      if (confirmRestart) {
        window.location.search = `?size=${newSize}`;
      } else {
        mazeSizeRange.value = mazeSize.toString();
      }
    }
  });

  // Track initial rotation state if needed, but TrackballControls handles it.

  window.addEventListener('wheel', (e) => {
    // Prevent browser zoom on pinch (ctrlKey is true for pinch on trackpads)
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, { passive: false });

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

    // Update Controls
    controls.update();

    // Update Maze Rotation from Proxy Camera
    // We want the maze to rotate in the opposite direction of the camera movement
    // so it feels like we are rotating the object itself.
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(proxyCamera.quaternion);
    const inverseRotation = rotationMatrix.invert();
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(inverseRotation);
    
    mazeGroup.quaternion.slerp(targetQuaternion, 0.15);

    // Sync Main Camera Zoom with Proxy Camera
    camera.position.z = proxyCamera.position.length();
    zoomRange.value = camera.position.z.toFixed(1);

    // Sync Rapier Kinematic Body
    mazeBody.setNextKinematicRotation(mazeGroup.quaternion);
    
    // Step Physics
    world.step(eventQueue);

    eventQueue.drainCollisionEvents((_handle1, _handle2, started) => {
      if (started && audioStarted && audioEnabled) {
        // Calculate the impact strength based on ball velocity
        const velocity = ballBody.linvel();
        const speed = Math.sqrt(velocity.x**2 + velocity.y**2 + velocity.z**2);
        
        // Map speed to volume (0.0 to 1.0)
        const volume = Math.min(speed / 10, 1);
        metalThud.triggerAttackRelease("C1", "32n", undefined, volume);
      }
    });

    // Sync Ball
    const ballPos = ballBody.translation();
    const ballRot = ballBody.rotation();
    ballMesh.position.set(ballPos.x, ballPos.y, ballPos.z);
    ballMesh.quaternion.set(ballRot.x, ballRot.y, ballRot.z, ballRot.w);

    // Sync Silhouette
    ballSilhouetteMesh.position.copy(ballMesh.position);

    // Visibility Tricks
    updateVisibility();

    // Limit Max Velocity
    const maxVelocity = 10.0;
    const velocity = ballBody.linvel();
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);

    if (speed > maxVelocity) {
      const ratio = maxVelocity / speed;
      ballBody.setLinvel(
        { 
          x: velocity.x * ratio, 
          y: velocity.y * ratio, 
          z: velocity.z * ratio 
        }, 
        true // wakeUp: true
      );
    }

    renderer.render(scene, camera);
    stats.update();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

init();
