export class Map {
    constructor() {
        this.tileSize = 32; // pixels per tile
        this.tiles = this.generateMap();
        this.teamSpawns = {
            red: { x: 0, y: 0 },
            blue: { x: 0, y: 0 }
        };
    }

    generateMap() {
        const width = 100;  // Increased from 50 to 100
        const height = 100; // Increased from 50 to 100
        const map = Array(height).fill().map(() => Array(width).fill(1)); // Start with all walls

        // Generate central objective room
        const centerRoom = this.generateRoom(
            Math.floor(width/2 - 10),  // Larger center room
            Math.floor(height/2 - 10),
            20,  // Increased size for central objective room
            20,
            map
        );

        // Generate team spawn rooms on opposite sides
        const redSpawnRoom = this.generateRoom(
            Math.floor(width * 0.15),
            Math.floor(height * 0.15),
            12,  // Increased spawn room size
            12,
            map
        );
        
        const blueSpawnRoom = this.generateRoom(
            Math.floor(width * 0.75),
            Math.floor(height * 0.75),
            12,  // Increased spawn room size
            12,
            map
        );

        // Store team spawn points
        this.teamSpawns = {
            red: { 
                x: redSpawnRoom.x + Math.floor(redSpawnRoom.width/2) * this.tileSize, 
                y: redSpawnRoom.y + Math.floor(redSpawnRoom.height/2) * this.tileSize 
            },
            blue: { 
                x: blueSpawnRoom.x + Math.floor(blueSpawnRoom.width/2) * this.tileSize, 
                y: blueSpawnRoom.y + Math.floor(blueSpawnRoom.height/2) * this.tileSize 
            }
        };

        // Connect spawn rooms to center
        this.generateHallway(redSpawnRoom, centerRoom, map);
        this.generateHallway(blueSpawnRoom, centerRoom, map);

        const rooms = [centerRoom, redSpawnRoom, blueSpawnRoom];
        const minRooms = 15;  // Increased minimum rooms
        const maxRooms = 25;  // Increased maximum rooms
        const attempts = maxRooms * 4;  // More attempts for larger map

        // Generate additional rooms
        for (let i = 0; i < attempts && rooms.length < maxRooms; i++) {
            const sourceRoom = rooms[Math.floor(Math.random() * rooms.length)];
            const direction = Math.floor(Math.random() * 4);
            const [dx, dy] = [
                [0, -1],  // North
                [1, 0],   // East
                [0, 1],   // South
                [-1, 0]   // West
            ][direction];

            // Spacing variation (0-10) - increased for larger map
            const hallwayLength = Math.floor(Math.random() * 11);
            // Room size variation (6-18) - increased size range
            const roomWidth = Math.floor(Math.random() * 13) + 6;
            const roomHeight = Math.floor(Math.random() * 13) + 6;

            const newX = sourceRoom.x + dx * (sourceRoom.width + hallwayLength);
            const newY = sourceRoom.y + dy * (sourceRoom.height + hallwayLength);

            if (this.canPlaceRoom(newX, newY, roomWidth, roomHeight, map)) {
                const newRoom = this.generateRoom(newX, newY, roomWidth, roomHeight, map);
                rooms.push(newRoom);
                this.generateHallway(sourceRoom, newRoom, map);
            }
        }

        // If we don't have enough rooms, force connections from existing rooms
        if (rooms.length < minRooms) {
            const additionalRoomsNeeded = minRooms - rooms.length;
            for (let i = 0; i < additionalRoomsNeeded * 5 && rooms.length < minRooms; i++) {
                const sourceRoom = rooms[Math.floor(Math.random() * rooms.length)];
                
                // Try different directions
                for (let dir = 0; dir < 4 && rooms.length < minRooms; dir++) {
                    const direction = (dir + Math.floor(Math.random() * 4)) % 4;
                    const [dx, dy] = [
                        [0, -1],  // North
                        [1, 0],   // East
                        [0, 1],   // South
                        [-1, 0]   // West
                    ][direction];

                    // Shorter hallways to fit more rooms
                    const hallwayLength = Math.floor(Math.random() * 6);
                    // Smaller rooms to fit more
                    const roomWidth = Math.floor(Math.random() * 6) + 6;
                    const roomHeight = Math.floor(Math.random() * 6) + 6;

                    const newX = sourceRoom.x + dx * (sourceRoom.width + hallwayLength);
                    const newY = sourceRoom.y + dy * (sourceRoom.height + hallwayLength);

                    if (this.canPlaceRoom(newX, newY, roomWidth, roomHeight, map)) {
                        const newRoom = this.generateRoom(newX, newY, roomWidth, roomHeight, map);
                        rooms.push(newRoom);
                        this.generateHallway(sourceRoom, newRoom, map);
                        break;
                    }
                }
            }
        }

        // Add some random connections between nearby rooms
        this.addExtraConnections(rooms, map);

        return map;
    }

    generateRoom(x, y, width, height, map) {
        // Create floor tiles (0)
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (y + dy >= 0 && y + dy < map.length &&
                    x + dx >= 0 && x + dx < map[0].length) {
                    map[y + dy][x + dx] = 0;
                }
            }
        }
        return { x, y, width, height };
    }

    generateHallway(room1, room2, map) {
        const x1 = room1.x + Math.floor(room1.width / 2);
        const y1 = room1.y + Math.floor(room1.height / 2);
        const x2 = room2.x + Math.floor(room2.width / 2);
        const y2 = room2.y + Math.floor(room2.height / 2);

        // Generate L-shaped hallway
        const midX = x1;
        const midY = y2;
        
        // Hallway width (2-4)
        const hallwayWidth = Math.floor(Math.random() * 3) + 2;
        const halfWidth = Math.floor(hallwayWidth / 2);

        // Draw horizontal part with width
        for (let x = Math.min(midX, x2); x <= Math.max(midX, x2); x++) {
            for (let w = -halfWidth; w <= halfWidth; w++) {
                const hallY = y2 + w;
                if (x >= 0 && x < map[0].length && hallY >= 0 && hallY < map.length) {
                    map[hallY][x] = 0;
                }
            }
        }

        // Draw vertical part with width
        for (let y = Math.min(y1, midY); y <= Math.max(y1, midY); y++) {
            for (let w = -halfWidth; w <= halfWidth; w++) {
                const hallX = x1 + w;
                if (hallX >= 0 && hallX < map[0].length && y >= 0 && y < map.length) {
                    map[y][hallX] = 0;
                }
            }
        }
    }

    canPlaceRoom(x, y, width, height, map) {
        // Only check actual map bounds, not buffer zone outside map
        if (x < 0 || y < 0 || 
            x + width > map[0].length || y + height > map.length) {
            return false;
        }
        
        const buffer = 1;
        // Only check within map bounds
        for (let dy = Math.max(0, y - buffer); dy < Math.min(map.length, y + height + buffer); dy++) {
            for (let dx = Math.max(0, x - buffer); dx < Math.min(map[0].length, x + width + buffer); dx++) {
                // Check if space is already a floor
                if (map[dy][dx] === 0) {
                    return false;
                }
            }
        }
        return true;
    }

    addExtraConnections(rooms, map) {
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const room1 = rooms[i];
                const room2 = rooms[j];
                
                const dist = Math.abs(room1.x - room2.x) + Math.abs(room1.y - room2.y);
                
                // Increased chance of connections and distance threshold
                if (dist < 30 && Math.random() < 0.4) {
                    this.generateHallway(room1, room2, map);
                }
            }
        }
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

    getSpawnPoint(team) {
        if (team === 'red' || team === 'blue') {
            return this.teamSpawns[team];
        }
        
        // For neutral/spectator, return center of map
        return {
            x: (this.tiles[0].length / 2) * this.tileSize,
            y: (this.tiles.length / 2) * this.tileSize
        };
    }
} 
