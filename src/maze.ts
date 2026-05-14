export interface Cell {
  x: number;
  y: number;
  z: number;
  visited: boolean;
  walls: {
    top: boolean;    // +y
    bottom: boolean; // -y
    left: boolean;   // -x
    right: boolean;  // +x
    front: boolean;  // +z
    back: boolean;   // -z
  };
}

export class Maze3D {
  size: number;
  grid: Cell[][][];

  constructor(size: number) {
    this.size = size;
    this.grid = [];
    this.initGrid();
    this.generate();
  }

  private initGrid() {
    for (let x = 0; x < this.size; x++) {
      this.grid[x] = [];
      for (let y = 0; y < this.size; y++) {
        this.grid[x][y] = [];
        for (let z = 0; z < this.size; z++) {
          this.grid[x][y][z] = {
            x, y, z,
            visited: false,
            walls: {
              top: true,
              bottom: true,
              left: true,
              right: true,
              front: true,
              back: true
            }
          };
        }
      }
    }
  }

  private getNeighbors(cell: Cell): { cell: Cell; dir: keyof Cell['walls']; oppDir: keyof Cell['walls'] }[] {
    const { x, y, z } = cell;
    const neighbors: { cell: Cell; dir: keyof Cell['walls']; oppDir: keyof Cell['walls'] }[] = [];

    if (x > 0) neighbors.push({ cell: this.grid[x - 1][y][z], dir: 'left', oppDir: 'right' });
    if (x < this.size - 1) neighbors.push({ cell: this.grid[x + 1][y][z], dir: 'right', oppDir: 'left' });
    if (y > 0) neighbors.push({ cell: this.grid[x][y - 1][z], dir: 'bottom', oppDir: 'top' });
    if (y < this.size - 1) neighbors.push({ cell: this.grid[x][y + 1][z], dir: 'top', oppDir: 'bottom' });
    if (z > 0) neighbors.push({ cell: this.grid[x][y][z - 1], dir: 'back', oppDir: 'front' });
    if (z < this.size - 1) neighbors.push({ cell: this.grid[x][y][z + 1], dir: 'front', oppDir: 'back' });

    return neighbors;
  }

  private generate() {
    const startCell = this.grid[0][0][0];
    startCell.visited = true;
    const stack: Cell[] = [startCell];

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const neighbors = this.getNeighbors(current).filter(n => !n.cell.visited);

      if (neighbors.length > 0) {
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        current.walls[next.dir] = false;
        next.cell.walls[next.oppDir] = false;
        next.cell.visited = true;
        stack.push(next.cell);
      } else {
        stack.pop();
      }
    }

    // Add start and end openings
    this.grid[0][0][0].walls.bottom = false;
    this.grid[this.size - 1][this.size - 1][this.size - 1].walls.top = false;
  }
}
