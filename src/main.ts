import './style.css';
import * as THREE from 'three';
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
  app.innerHTML = `
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

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight2.position.set(0, 10, 0);
  scene.add(dirLight2);

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
    .setLinearDamping(0.5)
    .setAngularDamping(0.5);
  const ballBody = world.createRigidBody(ballBodyDesc);
  const ballColliderDesc = RAPIER.ColliderDesc.ball(ballRadius)
    .setDensity(10.0)
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

  // --- Interaction (Virtual Trackball) ---
  const proxyCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  proxyCamera.position.set(0, 0, 12);
  
  const controls = new TrackballControls(proxyCamera, renderer.domElement);
  controls.rotateSpeed = 4.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.noZoom = false;
  controls.noPan = true;
  controls.staticMoving = true;
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
  
  const updateZoom = (value: number) => {
    proxyCamera.position.normalize().multiplyScalar(value);
    zoomRange.value = value.toString();
  };

  zoomRange.addEventListener('input', (e) => {
    updateZoom(parseFloat((e.target as HTMLInputElement).value));
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
