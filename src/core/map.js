export class Map {
    constructor() {
        this.tileSize = 32; // pixels per tile
        this.tiles = this.generateMap();
    }

    generateMap() {
        // For testing, let's create a 100x100 map
        // 0 = floor, 1 = wall
        const width = 100;
        const height = 100;
        const map = Array(height).fill().map(() => Array(width).fill(0));

        // Add some random walls
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Border walls
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    map[y][x] = 1;
                    continue;
                }
                // Random walls (15% chance)
                if (Math.random() < 0.15) {
                    map[y][x] = 1;
                }
            }
        }

        return map;
    }

    getTile(x, y) {
        if (x < 0 || x >= this.tiles[0].length || y < 0 || y >= this.tiles.length) {
            return 1; // Return wall for out of bounds
        }
        return this.tiles[y][x];
    }

    isWalkable(x, y) {
        return this.getTile(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize)) === 0;
    }
} 