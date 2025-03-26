export class RaycastEngine {
    constructor(game) {
        this.game = game;
        this.maxDistance = 700; // Maximum view distance
        this.rayCount = 120; // Number of rays to cast
        this.fovAngle = Math.PI * 80 / 180; // 80 degree FOV
        
        // Performance optimization settings
        this.adaptiveRayCount = true; // Enable adaptive ray count based on performance
        this.performanceStats = {
            lastFrameTime: 0,
            frameTimes: [],
            avgFrameTime: 0
        };
        
        // Visibility storage
        this.visibleTiles = new Set(); // Set of visible tile coordinates
        this.visiblePlayers = new Set(); // Set of visible player IDs
        
        // Performance optimization
        this.lastUpdateTime = 0;
        this.updateInterval = 50; // Update visibility every 50ms
        this.lastResults = null;
        
        // Precalculate sine and cosine values for common angles
        this.precalculateTrigTables();
    }
    
    // Enable or disable adaptive ray count
    setAdaptiveRayCount(enabled) {
        this.adaptiveRayCount = enabled;
        
        // Reset performance stats when changing mode
        this.performanceStats = {
            lastFrameTime: 0,
            frameTimes: [],
            avgFrameTime: 0
        };
    }
    
    // Create lookup tables for sine and cosine to avoid expensive calculations
    precalculateTrigTables() {
        const precision = 1000; // Number of values to precalculate
        this.sinTable = new Float32Array(precision);
        this.cosTable = new Float32Array(precision);
        
        for (let i = 0; i < precision; i++) {
            const angle = (i / precision) * (2 * Math.PI);
            this.sinTable[i] = Math.sin(angle);
            this.cosTable[i] = Math.cos(angle);
        }
    }
    
    // Get sine value from lookup table
    fastSin(angle) {
        // Normalize angle to [0, 2π]
        while (angle < 0) angle += 2 * Math.PI;
        while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
        
        // Get index in lookup table
        const index = Math.floor((angle / (2 * Math.PI)) * this.sinTable.length) % this.sinTable.length;
        return this.sinTable[index];
    }
    
    // Get cosine value from lookup table
    fastCos(angle) {
        // Normalize angle to [0, 2π]
        while (angle < 0) angle += 2 * Math.PI;
        while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
        
        // Get index in lookup table
        const index = Math.floor((angle / (2 * Math.PI)) * this.cosTable.length) % this.cosTable.length;
        return this.cosTable[index];
    }
    
    // Update the ray count based on performance
    updateAdaptiveRayCount() {
        if (!this.adaptiveRayCount) return;
        
        const frameTime = this.performanceStats.avgFrameTime;
        const targetFrameTime = 8; // Target 8ms per raycast (about 120fps)
        
        // Adjust ray count based on performance
        if (frameTime > targetFrameTime * 1.2) { // Too slow
            this.rayCount = Math.max(60, Math.floor(this.rayCount * 0.9));
        } else if (frameTime < targetFrameTime * 0.8) { // Too fast
            this.rayCount = Math.min(360, Math.floor(this.rayCount * 1.1));
        }
    }
    
    update() {
        const now = Date.now();
        const startTime = performance.now();
        
        // Only update periodically for performance
        if (now - this.lastUpdateTime < this.updateInterval) {
            return this.lastResults;
        }
        
        this.lastUpdateTime = now;
        const player = this.game.localPlayer;
        if (!player) return null;
        
        // Reset visibility data
        this.visibleTiles.clear();
        this.visiblePlayers.clear();
        
        // Cast rays based on player's aim direction
        const directionAngle = player.aim.angle || 0;
        this.castRays(player.x, player.y, directionAngle);
        
        // Check which players are visible
        this.checkVisiblePlayers(player.x, player.y, directionAngle);
        
        // Track performance
        const endTime = performance.now();
        const frameTime = endTime - startTime;
        
        this.performanceStats.frameTimes.push(frameTime);
        if (this.performanceStats.frameTimes.length > 30) {
            this.performanceStats.frameTimes.shift();
        }
        
        this.performanceStats.avgFrameTime = this.performanceStats.frameTimes.reduce(
            (sum, time) => sum + time, 0
        ) / this.performanceStats.frameTimes.length;
        
        // Update ray count based on performance
        this.updateAdaptiveRayCount();
        
        this.lastResults = {
            visibleTiles: this.visibleTiles,
            visiblePlayers: this.visiblePlayers,
            rayCount: this.rayCount,
            performance: {
                frameTime: frameTime,
                avgFrameTime: this.performanceStats.avgFrameTime
            }
        };
        
        return this.lastResults;
    }
    
    // Simple tile-based raycasting
    castRays(sourceX, sourceY, directionAngle) {
        const map = this.game.map;
        if (!map || !map.tiles) return;
        
        // Calculate start and end angles based on FOV
        const startAngle = directionAngle - this.fovAngle / 2;
        const endAngle = directionAngle + this.fovAngle / 2;
        const angleStep = this.fovAngle / this.rayCount;
        
        // Mark player's position as visible
        const playerTileX = Math.floor(sourceX / map.tileSize);
        const playerTileY = Math.floor(sourceY / map.tileSize);
        this.visibleTiles.add(`${playerTileX},${playerTileY}`);
        
        // Cast rays at different angles within FOV
        for (let angle = startAngle; angle <= endAngle; angle += angleStep) {
            this.castSingleRay(sourceX, sourceY, angle);
        }
    }
    
    castSingleRay(sourceX, sourceY, angle) {
        const map = this.game.map;
        const tileSize = map.tileSize;
        
        // Get direction vector
        const dirX = this.fastCos(angle);
        const dirY = this.fastSin(angle);
        
        // Current position in tiles
        let tileX = Math.floor(sourceX / tileSize);
        let tileY = Math.floor(sourceY / tileSize);
        
        // Distance to next tile boundary
        let stepX = 0, stepY = 0;
        let distToNextX = 0, distToNextY = 0;
        
        // Calculate step and initial distance to tile boundary
        if (dirX > 0) {
            stepX = 1;
            distToNextX = ((tileX + 1) * tileSize - sourceX) / dirX;
        } else if (dirX < 0) {
            stepX = -1;
            distToNextX = (tileX * tileSize - sourceX) / dirX;
        } else {
            distToNextX = Infinity;
        }
        
        if (dirY > 0) {
            stepY = 1;
            distToNextY = ((tileY + 1) * tileSize - sourceY) / dirY;
        } else if (dirY < 0) {
            stepY = -1;
            distToNextY = (tileY * tileSize - sourceY) / dirY;
        } else {
            distToNextY = Infinity;
        }
        
        // Distance traveled
        let distance = 0;
        let hitWall = false;
        
        // Digital Differential Analysis (DDA) algorithm
        while (distance < this.maxDistance && !hitWall) {
            // Add current tile to visible tiles
            if (tileX >= 0 && tileX < map.tiles[0].length && 
                tileY >= 0 && tileY < map.tiles.length) {
                this.visibleTiles.add(`${tileX},${tileY}`);
            }
            
            // Check if current tile is a wall
            if (tileX >= 0 && tileX < map.tiles[0].length && 
                tileY >= 0 && tileY < map.tiles.length && 
                map.getTile(tileX, tileY) === 1) {
                hitWall = true;
                break;
            }
            
            // Move to next tile
            if (distToNextX < distToNextY) {
                distance = distToNextX;
                distToNextX += tileSize / Math.abs(dirX);
                tileX += stepX;
            } else {
                distance = distToNextY;
                distToNextY += tileSize / Math.abs(dirY);
                tileY += stepY;
            }
        }
    }
    
    checkVisiblePlayers(sourceX, sourceY, directionAngle) {
        const player = this.game.localPlayer;
        
        this.game.players.forEach(otherPlayer => {
            if (otherPlayer.id === player.id || !otherPlayer.isAlive) return;
            
            // Calculate angle to other player
            const dx = otherPlayer.x - sourceX;
            const dy = otherPlayer.y - sourceY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Skip if too far away
            if (distance > this.maxDistance) return;
            
            // Check if player is within FOV
            const angle = Math.atan2(dy, dx);
            const angleDiff = Math.abs(this.normalizeAngle(angle - directionAngle));
            
            if (angleDiff > this.fovAngle / 2) return;
            
            // Check line of sight
            if (this.hasLineOfSight(sourceX, sourceY, otherPlayer.x, otherPlayer.y)) {
                this.visiblePlayers.add(otherPlayer.id);
            }
        });
    }
    
    hasLineOfSight(x1, y1, x2, y2) {
        const map = this.game.map;
        const tileSize = map.tileSize;
        
        // Optimize by using only a few points instead of tracing the entire line
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Number of samples depends on distance
        const numSamples = Math.min(10, Math.ceil(distance / tileSize));
        
        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            const x = x1 + dx * t;
            const y = y1 + dy * t;
            
            const tileX = Math.floor(x / tileSize);
            const tileY = Math.floor(y / tileSize);
            
            // Check if out of bounds
            if (tileX < 0 || tileX >= map.tiles[0].length || 
                tileY < 0 || tileY >= map.tiles.length) {
                return false;
            }
            
            // Check if we hit a wall
            if (map.getTile(tileX, tileY) === 1) {
                return false;
            }
        }
        
        return true;
    }
    
    normalizeAngle(angle) {
        // Normalize angle to range [-PI, PI]
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
    
    initVisibilityMap() {
        // Reset visibility data
        this.visibleTiles = new Set();
        this.visiblePlayers = new Set();
        
        // Force update on next game loop
        this.lastUpdateTime = 0;
        
        console.log('Visibility map reinitialized');
    }
    
    setMaxDistance(distance) {
        this.maxDistance = distance;
        // Reset visibility map when changing max distance
        this.initVisibilityMap();
    }
    
    setRayCount(count) {
        this.rayCount = count;
        // Reset visibility map when changing ray count
        this.initVisibilityMap();
    }
}

// Make RaycastEngine globally available
window.RaycastEngine = RaycastEngine; 