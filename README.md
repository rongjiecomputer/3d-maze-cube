# 3D Maze Cube

3D Maze Cube game with **WebGPU (Three.js)**, **Physics (Rapier.js)** and **Audio (Tone.js)**.

## Key Features
- **Procedural 3D Maze**: A recursive backtracker algorithm generates a unique 3D maze structure every time the game starts.
- **WebGPU Rendering**: Utilizes Three.js `WebGPURenderer` for high-performance, modern web graphics.
- **Real-time Physics**: Integrated Rapier.js to handle ball collisions and gravity dynamics.
- **Dynamic Gravity**: As you rotate the cube (via mouse drag), the internal gravity relative to the maze changes, causing the ball to roll through the passages.
- **Premium Aesthetics**: Features a translucent glass-like outer shell, green plastic maze walls, and a metallic physics ball.

## Implementation Details
- **`maze.ts`**: Contains the `Maze3D` class which handles the generation of a $5 \times 5 \times 5$ grid-based maze.
- **`main.ts`**: 
  - Initializes the WebGPU scene and Rapier physics world.
  - Converts the generated maze data into Three.js geometries and Rapier kinematic colliders.
  - Implements a custom rotation controller to let you manipulate the entire cube structure.
  - Syncs the physics state with the visual representation at 60 FPS.

## How to Run
1. Run `npm run dev` in the project directory.
2. Open the provided local URL in a browser that supports WebGPU (e.g., Chrome or Edge).
3. Drag your mouse to rotate the cube and guide the ball!
