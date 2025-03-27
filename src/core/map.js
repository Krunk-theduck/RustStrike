export class Map {
    constructor() {
        this.tileSize = 32; // pixels per tile
        
        // Initialize all properties before generating map
        this.teamSpawns = {
            red: { x: 0, y: 0 },
            blue: { x: 0, y: 0 }
        };
        
        this.rooms = {
            redSpawn: null,
            blueSpawn: null,
            center: null,
            bombSite: null // Add bomb site room reference
        };
        
        this.decorations = null; // Will initialize after map generation
        this.tiles = this.generateMap();
        
        // Initialize decorations array after we have tile dimensions
        this.decorations = Array(this.tiles.length).fill().map(() => 
            Array(this.tiles[0].length).fill(null)
        );
        
        // Now decorate the rooms after everything is initialized
        if (this.rooms.redSpawn) this.decorateRoom(this.rooms.redSpawn, 'red');
        if (this.rooms.blueSpawn) this.decorateRoom(this.rooms.blueSpawn, 'blue');
        if (this.rooms.bombSite) this.decorateRoom(this.rooms.bombSite, 'bombsite');
    }

    generateMap() {
        const width = 100;
        const height = 100;
        const map = Array(height).fill().map(() => Array(width).fill(1));
        
        // Track all rooms for wall generation
        const allRooms = [];

        // Generate central objective room
        const centerRoom = this.generateRoom(
            Math.floor(width/2 - 10),
            Math.floor(height/2 - 10),
            20,
            20,
            map
        );
        this.rooms.center = centerRoom;
        allRooms.push(centerRoom);

        // Generate team spawn rooms on opposite sides
        const redSpawnRoom = this.generateRoom(
            Math.floor(width * 0.15),
            Math.floor(height * 0.15),
            12,
            12,
            map
        );
        this.rooms.redSpawn = redSpawnRoom;
        allRooms.push(redSpawnRoom);
        
        const blueSpawnRoom = this.generateRoom(
            Math.floor(width * 0.75),
            Math.floor(height * 0.75),
            12,
            12,
            map
        );
        this.rooms.blueSpawn = blueSpawnRoom;
        allRooms.push(blueSpawnRoom);

        // Update team spawn points - center of the spawn rooms
        const redSpawn = { 
            x: (redSpawnRoom.x + Math.floor(redSpawnRoom.width/2)) * this.tileSize, 
            y: (redSpawnRoom.y + Math.floor(redSpawnRoom.height/2)) * this.tileSize 
        };
        const blueSpawn = { 
            x: (blueSpawnRoom.x + Math.floor(blueSpawnRoom.width/2)) * this.tileSize, 
            y: (blueSpawnRoom.y + Math.floor(blueSpawnRoom.height/2)) * this.tileSize 
        };

        // Update the instance variable directly
        this.teamSpawns.red = redSpawn;
        this.teamSpawns.blue = blueSpawn;

        // Connect spawn rooms to center
        this.generateHallway(redSpawnRoom, centerRoom, map);
        this.generateHallway(blueSpawnRoom, centerRoom, map);

        // Generate bomb site room - a large room near the red spawn (attackers)
        // We'll try to place it somewhere between the red spawn and center
        const bombSiteRoom = this.generateBombSiteRoom(redSpawnRoom, centerRoom, map);
        if (bombSiteRoom) {
            this.rooms.bombSite = bombSiteRoom;
            allRooms.push(bombSiteRoom);
            // Connect bomb site to both red spawn and center
            this.generateHallway(redSpawnRoom, bombSiteRoom, map);
            this.generateHallway(centerRoom, bombSiteRoom, map);
        }

        const rooms = [centerRoom, redSpawnRoom, blueSpawnRoom];
        const minRooms = 15;
        const maxRooms = 25;
        const attempts = maxRooms * 4;

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

            const hallwayLength = Math.floor(Math.random() * 11);
            const roomWidth = Math.floor(Math.random() * 13) + 6;
            const roomHeight = Math.floor(Math.random() * 13) + 6;

            const newX = sourceRoom.x + dx * (sourceRoom.width + hallwayLength);
            const newY = sourceRoom.y + dy * (sourceRoom.height + hallwayLength);

            if (this.canPlaceRoom(newX, newY, roomWidth, roomHeight, map)) {
                const newRoom = this.generateRoom(newX, newY, roomWidth, roomHeight, map);
                rooms.push(newRoom);
                allRooms.push(newRoom);
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

                    const hallwayLength = Math.floor(Math.random() * 6);
                    const roomWidth = Math.floor(Math.random() * 6) + 6;
                    const roomHeight = Math.floor(Math.random() * 6) + 6;

                    const newX = sourceRoom.x + dx * (sourceRoom.width + hallwayLength);
                    const newY = sourceRoom.y + dy * (sourceRoom.height + hallwayLength);

                    if (this.canPlaceRoom(newX, newY, roomWidth, roomHeight, map)) {
                        const newRoom = this.generateRoom(newX, newY, roomWidth, roomHeight, map);
                        rooms.push(newRoom);
                        allRooms.push(newRoom);
                        this.generateHallway(sourceRoom, newRoom, map);
                        break;
                    }
                }
            }
        }

        // Add some random connections between nearby rooms
        this.addExtraConnections(rooms, map);
        
        // Now add walls around all rooms and hallways
        this.addWallsAroundOpenAreas(map);
        
        // Store the walkable areas for efficient collision detection
        this.buildSpatialIndex(map);

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
        // Convert to tile coordinates
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        
        // Quick check using the tile map
        if (tileX < 0 || tileX >= this.tiles[0].length || tileY < 0 || tileY >= this.tiles.length) {
            return false; // Out of bounds
        }
        
        return this.tiles[tileY][tileX] === 0;
    }

    getSpawnPoint(team) {
        
        if (team === 'red' || team === 'blue') {
            // Get the base spawn point for the team
            const spawnPoint = this.teamSpawns[team];
            
            // Add a small random offset within the spawn area (2 tiles in any direction)
            const offsetX = (Math.random() * 2 - 1) * this.tileSize * 2;
            const offsetY = (Math.random() * 2 - 1) * this.tileSize * 2;
            
            const finalSpawn = {
                x: spawnPoint.x + offsetX,
                y: spawnPoint.y + offsetY
            };

            return finalSpawn;
        }
        
        // For neutral/spectator, return center of map
        const centerSpawn = {
            x: (this.tiles[0].length / 2) * this.tileSize,
            y: (this.tiles.length / 2) * this.tileSize
        };
        return centerSpawn;
    }

    // New method to add walls only around open areas
    addWallsAroundOpenAreas(map) {
        const height = map.length;
        const width = map[0].length;
        
        // Create a copy of the map to work with
        const newMap = Array(height).fill().map((_, y) => Array(width).fill(0));
        
        // For each floor tile, check if it needs a wall around it
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // If it's a floor tile, keep it as floor
                if (map[y][x] === 0) {
                    newMap[y][x] = 0;
                    
                    // Check 8 surrounding tiles and add walls if they're empty
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue; // Skip the center
                            
                            const nx = x + dx;
                            const ny = y + dy;
                            
                            // If out of bounds or not a floor tile, add a wall
                            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                                continue; // Skip out of bounds
                            }
                            
                            // If this is empty space (not a floor), mark it as a wall
                            if (map[ny][nx] === 0) {
                                // Skip, it's already a floor
                            } else {
                                newMap[ny][nx] = 1; // Add wall
                            }
                        }
                    }
                }
            }
        }
        
        // Copy the new map back to the original
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                map[y][x] = newMap[y][x];
            }
        }
    }

    // Build a spatial index for efficient collision detection
    buildSpatialIndex(map) {
        // Create a grid of cells for spatial partitioning
        const cellSize = 10; // Each cell covers 10x10 tiles
        const width = map[0].length;
        const height = map.length;
        
        this.spatialGrid = {};
        
        // For each wall tile, add it to the appropriate cell
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (map[y][x] === 1) { // If it's a wall
                    const cellX = Math.floor(x / cellSize);
                    const cellY = Math.floor(y / cellSize);
                    const cellKey = `${cellX},${cellY}`;
                    
                    if (!this.spatialGrid[cellKey]) {
                        this.spatialGrid[cellKey] = [];
                    }
                    
                    this.spatialGrid[cellKey].push({
                        x: x * this.tileSize,
                        y: y * this.tileSize,
                        width: this.tileSize,
                        height: this.tileSize
                    });
                }
            }
        }
    }

    // Optimize the canMove method in Player class to use spatial partitioning
    canMove(newX, newY, map) {
        // Check corners of player hitbox
        const points = [
            { x: newX - this.size/2, y: newY - this.size/2 },
            { x: newX + this.size/2, y: newY - this.size/2 },
            { x: newX - this.size/2, y: newY + this.size/2 },
            { x: newX + this.size/2, y: newY + this.size/2 }
        ];

        return points.every(point => map.isWalkable(point.x, point.y));
    }

    decorateRoom(room, decoration) {
        for (let y = room.y; y < room.y + room.height; y++) {
            for (let x = room.x; x < room.x + room.width; x++) {
                if (y >= 0 && y < this.decorations.length && 
                    x >= 0 && x < this.decorations[0].length) {
                    this.decorations[y][x] = decoration;
                }
            }
        }
    }

    getDecoration(x, y) {
        if (x < 0 || x >= this.decorations[0].length || 
            y < 0 || y >= this.decorations.length) {
            return null;
        }
        return this.decorations[y][x];
    }

    // Add a new method to generate the bomb site room
    generateBombSiteRoom(attackerSpawn, centerRoom, map) {
        // We want to place the bomb site somewhere near the attacker spawn
        // but not too close, and not too close to the center either
        
        // Calculate a position between attacker spawn and center, but closer to attacker spawn
        const midX = Math.floor(attackerSpawn.x + (centerRoom.x - attackerSpawn.x) * 0.4);
        const midY = Math.floor(attackerSpawn.y + (centerRoom.y - attackerSpawn.y) * 0.4);
        
        // Try a few different positions if the first one doesn't work
        for (let attempt = 0; attempt < 10; attempt++) {
            // Add some randomness to the position
            const offsetX = Math.floor((Math.random() * 20) - 10);
            const offsetY = Math.floor((Math.random() * 20) - 10);
            
            const roomX = midX + offsetX;
            const roomY = midY + offsetY;
            
            // Make the bomb site a large room
            const roomWidth = Math.floor(Math.random() * 6) + 16; // 16-21 tiles
            const roomHeight = Math.floor(Math.random() * 6) + 16; // 16-21 tiles
            
            if (this.canPlaceRoom(roomX, roomY, roomWidth, roomHeight, map)) {
                const bombSite = this.generateRoom(roomX, roomY, roomWidth, roomHeight, map);
                return bombSite;
            }
        }
        
        // If we can't find a good spot after several attempts, use the center room as fallback
        console.warn('Could not create dedicated bomb site room, using center room as bomb site');
        return centerRoom;
    }

    // Add a method to check if a position is within the bomb site
    isInBombSite(x, y) {
        // Convert to tile coordinates
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        
        // Check if this tile has the bombsite decoration
        if (tileX >= 0 && tileX < this.decorations[0].length && 
            tileY >= 0 && tileY < this.decorations.length) {
            return this.decorations[tileY][tileX] === 'bombsite';
        }
        
        return false;
    }
}

// Make Map globally available as GameMap to avoid conflicts with built-in Map
window.GameMap = Map; 
