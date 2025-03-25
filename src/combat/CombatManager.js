import { Weapon, WeaponCatalog } from './Weapon.js';

export class CombatManager {
    constructor(game) {
        this.game = game;
        this.bulletTrails = []; // For visual effects
        this.hitMarkers = []; // For visual effects
        
        // Configuration
        this.bulletTrailDuration = 100; // ms
        this.hitMarkerDuration = 500; // ms
        
        // Set up weapon switching handlers
        this.setupWeaponSwitchHandlers();
        
        // Set up shot handlers
        this.setupShotListeners();
        
        // Flag to track if mouse is pressed
        this.isMouseDown = false;
        
        // Setup default weapon for all players
        this.setupDefaultWeapons();
    }
    
    // Give default weapon to local player when joining
    setupDefaultWeapons() {
        if (!this.game.localPlayer) return;
        
        // If player has no equipment, initialize it
        if (!this.game.localPlayer.equipment) {
            this.game.localPlayer.equipment = [];
        }
        
        // Only add starter pistol if no weapons exist
        if (this.game.localPlayer.equipment.length === 0) {
            try {
                const starterPistol = WeaponCatalog.createWeapon('STARTER_PISTOL');
                if (starterPistol) {
                    this.game.localPlayer.equipment.push(starterPistol);
                    this.game.localPlayer.activeWeaponIndex = 0;
                    console.log('Default weapon added to player:', starterPistol.name);
                } else {
                    console.error('Failed to create starter pistol');
                }
            } catch (error) {
                console.error('Error setting up default weapon:', error);
            }
        }
    }
    
    // Set up keyboard handlers for weapon switching
    setupWeaponSwitchHandlers() {
        window.addEventListener('keydown', (e) => {
            if (!this.game.isRunning || !this.game.localPlayer) return;
            
            // Switch to primary weapon with 1 key
            if (e.key === '1') {
                this.switchWeapon(0);
            }
            // Switch to secondary weapon with 2 key
            else if (e.key === '2') {
                this.switchWeapon(1);
            }
            // Reload with R key
            else if (e.key === 'r') {
                this.reloadCurrentWeapon();
            }
        });
        
        // Mouse wheel for weapon switching
        window.addEventListener('wheel', (e) => {
            if (!this.game.isRunning || !this.game.localPlayer) return;
            
            // Positive deltaY is scroll down, negative is scroll up
            const direction = e.deltaY > 0 ? 1 : -1;
            this.cycleWeapon(direction);
        });
        
        // Mouse down for shooting
        this.game.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                this.isMouseDown = true;
                this.tryToShoot();
            }
        });
        
        // Mouse up to stop shooting
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) { // Left mouse button
                this.isMouseDown = false;
            }
        });
        
        // Blur/focus handling to prevent stuck shooting
        window.addEventListener('blur', () => {
            this.isMouseDown = false;
        });
    }
    
    // Set up listeners for shots fired by other players
    setupShotListeners() {
        if (!this.game.roomManager.activeRoom) return;
        
        const shotsRef = this.game.database.ref(`rooms/${this.game.roomManager.activeRoom}/shots`);
        
        // Listen for new shots
        shotsRef.on('child_added', (snapshot) => {
            const shotData = snapshot.val();
            if (!shotData) return;
            
            // Don't process our own shots (already handled locally)
            if (shotData.playerId === this.game.localPlayer.id) return;
            
            // Process shot from another player
            this.processRemoteShot(shotData);
            
            // Remove the shot data to keep the database clean
            snapshot.ref.remove();
        });
        
        // Listen for damage events
        const damageRef = this.game.database.ref(`rooms/${this.game.roomManager.activeRoom}/damage`);
        
        damageRef.on('child_added', (snapshot) => {
            const damageData = snapshot.val();
            if (!damageData) return;
            
            // Process damage event
            this.processRemoteDamage(damageData);
            
            // Remove the damage data
            snapshot.ref.remove();
        });
    }
    
    // Process shot fired by another player
    processRemoteShot(shotData) {
        const shooter = this.game.players.get(shotData.playerId);
        if (!shooter || !shooter.isAlive) return;
        
        // Get the weapon the player is using
        const weapon = shooter.equipment && shooter.equipment[shooter.activeWeaponIndex];
        if (!weapon) return;
        
        // Calculate bullet trajectory
        const angle = shotData.angle;
        
        // For visual effects only - we trust the shooter's hit detection
        this.addBulletTrail(
            shooter.x, 
            shooter.y, 
            shooter.x + Math.cos(angle) * weapon.range, 
            shooter.y + Math.sin(angle) * weapon.range,
            weapon.bulletTrailColor
        );
    }
    
    // Process damage event
    processRemoteDamage(damageData) {
        const { targetId, damage, shooterId } = damageData;
        
        // Skip if this update is about the local player as shooter - we've already handled it
        if (this.game.localPlayer && shooterId === this.game.localPlayer.id) {
            console.log('Skipping remote damage update for local player shot - already processed');
            return;
        }
        
        // Find the target player
        let targetPlayer = null;
        
        if (this.game.localPlayer && this.game.localPlayer.id === targetId) {
            targetPlayer = this.game.localPlayer;
        } else {
            targetPlayer = this.game.players.get(targetId);
        }
        
        if (!targetPlayer) {
            console.error(`Target player ${targetId} not found for remote damage`);
            return;
        }
        
        // For remote players, directly update health to match server value
        // This avoids double-processing damage
        const currentHealth = Math.max(0, targetPlayer.health - damage);
        targetPlayer.health = currentHealth;
        
        console.log(`Remote damage processed: Player ${targetId} health updated to ${currentHealth}`);
        
        // If player died, handle kill
        if (currentHealth <= 0 && targetPlayer.isAlive) {
            targetPlayer.isAlive = false;
            this.handlePlayerKill(targetId, shooterId);
        }
        
        // Add visual hit effect
        this.addHitEffect(damageData);
    }
    
    // Show visual feedback when player takes damage
    showDamageFeedback() {
        // Simple red flash effect on screen
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '1000';
        document.body.appendChild(overlay);
        
        // Fade out and remove
        setTimeout(() => {
            overlay.style.transition = 'opacity 0.5s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 500);
        }, 100);
    }
    
    // Switch to specific weapon slot
    switchWeapon(index) {
        const player = this.game.localPlayer;
        if (!player || !player.equipment || player.equipment.length === 0) return;
        
        // Only switch if we have a weapon in that slot
        if (index < player.equipment.length) {
            player.activeWeaponIndex = index;
            this.syncWeaponChange();
        }
    }
    
    // Cycle through available weapons
    cycleWeapon(direction) {
        const player = this.game.localPlayer;
        if (!player || !player.equipment || player.equipment.length <= 1) return;
        
        // Calculate new index with wrap-around
        let newIndex = player.activeWeaponIndex + direction;
        if (newIndex < 0) newIndex = player.equipment.length - 1;
        if (newIndex >= player.equipment.length) newIndex = 0;
        
        player.activeWeaponIndex = newIndex;
        this.syncWeaponChange();
    }
    
    // Reload current weapon
    reloadCurrentWeapon() {
        const player = this.game.localPlayer;
        if (!player || !player.equipment || player.equipment.length === 0) return;
        
        const weapon = player.equipment[player.activeWeaponIndex];
        if (weapon) {
            weapon.startReload();
        }
    }
    
    // Sync weapon change to server
    syncWeaponChange() {
        if (!this.game.roomManager.activeRoom || !this.game.localPlayer) return;
        
        const playerRef = this.game.database.ref(
            `rooms/${this.game.roomManager.activeRoom}/players/${this.game.localPlayer.id}`
        );
        
        playerRef.update({
            activeWeaponIndex: this.game.localPlayer.activeWeaponIndex
        });
    }
    
    // Update method called every frame
    update() {
        // Handle continuous shooting for automatic weapons
        if (this.isMouseDown) {
            this.tryToShoot();
        }
        
        // Update visual effects
        this.updateVisualEffects();
    }
    
    // Update bullet trails and hit markers
    updateVisualEffects() {
        const now = Date.now();
        
        // Update bullet trails
        this.bulletTrails = this.bulletTrails.filter(trail => 
            now - trail.createdTime < trail.duration
        );
        
        // Update hit markers
        this.hitMarkers = this.hitMarkers.filter(marker =>
            now - marker.createdTime < marker.duration
        );
    }
    
    // Try to shoot current weapon
    tryToShoot() {
        const player = this.game.localPlayer;
        if (!player || !player.isAlive || !player.equipment || player.equipment.length === 0) return;
        
        if (this.game.roundManager.currentState !== this.game.roundManager.STATES.ACTIVE) {
            return; // Only allow shooting during active phase
        }
        
        this.shoot();
    }
    
    // Handle shooting
    shoot() {
        const player = this.game.localPlayer;
        if (!player || !player.isAlive || !player.equipment || player.equipment.length === 0) return;
        
        const weapon = player.equipment[player.activeWeaponIndex];
        if (!weapon) return;
        
        const now = Date.now();
        if (!weapon.canFire(now)) return;
        
        // Fire the weapon
        if (weapon.fire(now)) {
            // Special case for shotguns with multiple pellets
            const pelletCount = weapon.pelletCount || 1;
            
            for (let i = 0; i < pelletCount; i++) {
                // Calculate bullet trajectory with accuracy variation
                const bulletAngle = weapon.calculateBulletTrajectory(player.aim.angle);
                
                // Raycast to find hit
                const hit = this.raycastBullet(
                    player.x, 
                    player.y, 
                    bulletAngle, 
                    weapon.range,
                    player.id
                );
                
                // Add bullet trail effect
                this.addBulletTrail(
                    player.x, 
                    player.y, 
                    hit.x, 
                    hit.y, 
                    weapon.bulletTrailColor
                );
                
                // Apply damage if we hit a player
                if (hit.playerId) {
                    const distance = Math.sqrt(
                        Math.pow(hit.x - player.x, 2) + 
                        Math.pow(hit.y - player.y, 2)
                    );
                    
                    const damage = weapon.calculateDamage(distance);
                    this.applyDamage(hit.playerId, damage, player.id);
                    
                    // Add hit marker effect
                    this.addHitMarker(hit.x, hit.y);
                }
            }
            
            // Sync shot with server
            this.syncShot(player.id, player.aim.angle);
            
            return true;
        }
        
        return false;
    }
    
    // Raycast to find bullet hit point
    raycastBullet(startX, startY, angle, maxDistance, shooterId) {
        const map = this.game.map;
        if (!map) return { x: startX, y: startY, playerId: null };
        
        // Direction vector
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        
        // Raycast through the map to find wall hit
        const wallHit = this.raycastToWall(startX, startY, dirX, dirY, maxDistance);
        
        // Check for player hits
        let closestPlayerHit = { 
            x: wallHit.x, 
            y: wallHit.y, 
            playerId: null, 
            distance: wallHit.distance 
        };
        
        this.game.players.forEach((player, playerId) => {
            // Skip shooter and dead players
            if (playerId === shooterId || !player.isAlive) return;
            
            // Check if ray intersects with player
            const hit = this.checkPlayerHit(
                startX, startY, dirX, dirY, player, closestPlayerHit.distance
            );
            
            if (hit && hit.distance < closestPlayerHit.distance) {
                closestPlayerHit = hit;
            }
        });
        
        return closestPlayerHit;
    }
    
    // Raycast to find wall intersection
    raycastToWall(startX, startY, dirX, dirY, maxDistance) {
        const map = this.game.map;
        const tileSize = map.tileSize;
        
        // Current position in tiles
        let tileX = Math.floor(startX / tileSize);
        let tileY = Math.floor(startY / tileSize);
        
        // Distance to next tile boundary
        let stepX = 0, stepY = 0;
        let distToNextX = 0, distToNextY = 0;
        
        // Calculate step and initial distance to tile boundary
        if (dirX > 0) {
            stepX = 1;
            distToNextX = ((tileX + 1) * tileSize - startX) / dirX;
        } else if (dirX < 0) {
            stepX = -1;
            distToNextX = (tileX * tileSize - startX) / dirX;
        } else {
            distToNextX = Infinity;
        }
        
        if (dirY > 0) {
            stepY = 1;
            distToNextY = ((tileY + 1) * tileSize - startY) / dirY;
        } else if (dirY < 0) {
            stepY = -1;
            distToNextY = (tileY * tileSize - startY) / dirY;
        } else {
            distToNextY = Infinity;
        }
        
        // Distance traveled
        let distance = 0;
        
        // Digital Differential Analysis (DDA) algorithm
        while (distance < maxDistance) {
            // Check if current tile is a wall
            if (tileX >= 0 && tileX < map.tiles[0].length && 
                tileY >= 0 && tileY < map.tiles.length && 
                map.getTile(tileX, tileY) === 1) {
                
                // Calculate exact hit point on wall
                let wallX, wallY;
                
                if (distToNextX < distToNextY) {
                    // Hit vertical wall
                    wallX = stepX > 0 ? tileX * tileSize : (tileX + 1) * tileSize;
                    wallY = startY + (wallX - startX) * dirY / dirX;
                } else {
                    // Hit horizontal wall
                    wallY = stepY > 0 ? tileY * tileSize : (tileY + 1) * tileSize;
                    wallX = startX + (wallY - startY) * dirX / dirY;
                }
                
                return { x: wallX, y: wallY, distance: distance };
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
        
        // If no wall hit, return point at max distance
        return {
            x: startX + dirX * maxDistance,
            y: startY + dirY * maxDistance,
            distance: maxDistance
        };
    }
    
    // Check if ray hits a player
    checkPlayerHit(startX, startY, dirX, dirY, player, maxDistance) {
        // Simplified player hitbox as a circle
        const dx = player.x - startX;
        const dy = player.y - startY;
        
        // Project point onto ray
        const t = dx * dirX + dy * dirY;
        
        // Point is behind ray
        if (t < 0) return null;
        
        // Point is beyond max distance
        if (t > maxDistance) return null;
        
        // Closest point on ray to player center
        const closestX = startX + dirX * t;
        const closestY = startY + dirY * t;
        
        // Distance from closest point to player center
        const distance = Math.sqrt(
            Math.pow(closestX - player.x, 2) + 
            Math.pow(closestY - player.y, 2)
        );
        
        // Hit if distance is less than player radius
        if (distance <= player.size / 2) {
            return {
                x: closestX,
                y: closestY,
                playerId: player.id,
                distance: t
            };
        }
        
        return null;
    }
    
    // Apply damage to a player
    applyDamage(targetId, damage, shooterId) {
        // Find the target player
        let targetPlayer = null;
        
        if (this.game.localPlayer && this.game.localPlayer.id === targetId) {
            targetPlayer = this.game.localPlayer;
        } else {
            targetPlayer = this.game.players.get(targetId);
        }
        
        if (!targetPlayer) {
            console.error(`Target player ${targetId} not found`);
            return 0;
        }
        
        // Track if this is a local player taking damage
        const isLocalPlayerDamaged = targetPlayer === this.game.localPlayer;
        const isLocalPlayerShooting = shooterId === this.game.localPlayer?.id;
        
        // Apply damage to player - for client prediction purposes
        const previousHealth = targetPlayer.health;
        const remainingHealth = targetPlayer.takeDamage(damage);
        
        console.log(`Player ${targetId} took ${damage} damage. Health: ${remainingHealth}`);
        
        // Check if player died
        if (remainingHealth <= 0) {
            this.handlePlayerKill(targetId, shooterId);
        }
        
        // Always sync health if we're the local shooter or it's the local player taking damage
        // This helps maintain consistency and reduces redundant updates
        if (isLocalPlayerShooting || isLocalPlayerDamaged) {
            this.syncHealth(targetId, remainingHealth);
            
            // Only sync damage event if we're the shooter - to avoid duplicate events
            if (isLocalPlayerShooting) {
                this.syncDamage(targetId, damage, shooterId);
            }
        }
        
        // Show damage feedback regardless - this enhances the player experience
        this.showDamageFeedback();
        
        // Add visual hit effect
        this.addHitEffect({
            targetId,
            damage,
            shooterId,
            previousHealth,
            newHealth: remainingHealth
        });
        
        return remainingHealth;
    }
    
    // Handle player kill
    handlePlayerKill(targetId, shooterId) {
        console.log(`Player ${targetId} killed by ${shooterId}`);
        
        // Find the target player
        let targetPlayer = null;
        if (this.game.localPlayer && this.game.localPlayer.id === targetId) {
            targetPlayer = this.game.localPlayer;
        } else {
            targetPlayer = this.game.players.get(targetId);
        }
        
        // Find the shooter
        let shooterPlayer = null;
        if (this.game.localPlayer && this.game.localPlayer.id === shooterId) {
            shooterPlayer = this.game.localPlayer;
        } else if (shooterId) {
            shooterPlayer = this.game.players.get(shooterId);
        }
        
        // Award money to shooter if they exist
        if (shooterPlayer) {
            // Award money for kill (200)
            shooterPlayer.money += 200;
            console.log(`Awarded $200 to ${shooterId} for kill`);
            
            // If local player, sync money update
            if (shooterPlayer === this.game.localPlayer) {
                this.syncPlayerEquipment(shooterPlayer);
            }
        }
        
        // Show notification of the kill
        this.showKillNotification(targetId);
        
        // Force a win condition check - this helps ensure the round ends promptly
        if (this.game.roundManager) {
            console.log("Triggering win condition check after player kill");
            setTimeout(() => {
                this.game.roundManager.checkRoundWinConditions();
            }, 100);
        }
    }
    
    // Show kill notification
    showKillNotification(targetId) {
        const target = this.game.players.get(targetId);
        if (!target) return;
        
        const notification = document.createElement('div');
        notification.style.position = 'absolute';
        notification.style.top = '100px';
        notification.style.right = '20px';
        notification.style.padding = '10px';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        notification.style.color = 'white';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '1001';
        
        const targetTeamColor = target.team === 'red' ? '#ff6666' : '#6666ff';
        notification.innerHTML = `You eliminated <span style="color: ${targetTeamColor}">${target.id}</span> (+$200)`;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transition = 'opacity 1s';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 1000);
        }, 3000);
    }
    
    // Sync shot with server
    syncShot(playerId, angle) {
        if (!this.game.roomManager.activeRoom) return;
        
        const shotsRef = this.game.database.ref(
            `rooms/${this.game.roomManager.activeRoom}/shots`
        ).push();
        
        shotsRef.set({
            playerId: playerId,
            angle: angle,
            timestamp: window.ServerValue.TIMESTAMP
        });
    }
    
    // Sync health with server
    syncHealth(playerId, health) {
        if (!this.game.roomManager.activeRoom) return;
        
        console.log(`Syncing health for player ${playerId}: ${health}, isAlive: ${health > 0}`);
        
        const playerRef = this.game.database.ref(
            `rooms/${this.game.roomManager.activeRoom}/players/${playerId}`
        );
        
        // Sync both health and isAlive status
        playerRef.update({ 
            health: health,
            isAlive: health > 0
        }).catch(error => {
            console.error("Error syncing health:", error);
        });
        
        // Force a win condition check after syncing health if player died
        if (health <= 0 && this.game.isHost && this.game.roundManager) {
            console.log(`Player ${playerId} died, checking win conditions...`);
            setTimeout(() => {
                this.game.roundManager.checkRoundWinConditions();
            }, 200);
        }
    }
    
    // Sync damage with server
    syncDamage(targetId, damage, shooterId) {
        if (!this.game.roomManager.activeRoom) return;
        
        const damageRef = this.game.database.ref(
            `rooms/${this.game.roomManager.activeRoom}/damage`
        ).push();
        
        // Add a timestamp to ensure events are processed in order
        damageRef.set({
            targetId: targetId,
            damage: damage,
            shooterId: shooterId,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            // Explicitly include the expected health result to help maintain consistency
            finalHealth: Math.max(0, this.game.players.get(targetId)?.health || 0)
        });
    }
    
    // Visual effects - add bullet trail
    addBulletTrail(startX, startY, endX, endY, color) {
        this.bulletTrails.push({
            startX, startY, endX, endY, color,
            createdTime: Date.now(),
            duration: this.bulletTrailDuration
        });
    }
    
    // Visual effects - add hit marker
    addHitMarker(x, y) {
        this.hitMarkers.push({
            x, y,
            createdTime: Date.now(),
            duration: this.hitMarkerDuration
        });
    }
    
    // Render visual effects
    render(ctx, camera) {
        const now = Date.now();
        
        // Render bullet trails
        this.bulletTrails.forEach(trail => {
            const alpha = 1 - ((now - trail.createdTime) / trail.duration);
            
            ctx.strokeStyle = trail.color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(
                trail.startX - camera.x, 
                trail.startY - camera.y
            );
            ctx.lineTo(
                trail.endX - camera.x, 
                trail.endY - camera.y
            );
            ctx.stroke();
        });
        
        // Render hit markers
        this.hitMarkers.forEach(marker => {
            const alpha = 1 - ((now - marker.createdTime) / marker.duration);
            const size = 8;
            
            ctx.strokeStyle = '#fff';
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 2;
            
            // Draw a small X
            ctx.beginPath();
            ctx.moveTo(marker.x - size - camera.x, marker.y - size - camera.y);
            ctx.lineTo(marker.x + size - camera.x, marker.y + size - camera.y);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(marker.x + size - camera.x, marker.y - size - camera.y);
            ctx.lineTo(marker.x - size - camera.x, marker.y + size - camera.y);
            ctx.stroke();
        });
        
        // Render damage texts
        if (this.damageTexts && this.damageTexts.length > 0) {
            // Remove expired damage texts
            this.damageTexts = this.damageTexts.filter(text => 
                now - text.createdAt < text.duration
            );
            
            // Render active damage texts
            this.damageTexts.forEach(text => {
                // Update position based on velocity
                text.y += text.velocity.y;
                text.x += text.velocity.x;
                
                // Calculate opacity based on age
                const age = now - text.createdAt;
                text.opacity = 1 - (age / text.duration);
                
                // Render text
                ctx.font = `bold ${text.size}px Arial`;
                ctx.fillStyle = `rgba(255, 51, 51, ${text.opacity})`;
                ctx.textAlign = 'center';
                ctx.fillText(
                    text.text, 
                    text.x - camera.x, 
                    text.y - camera.y
                );
            });
        }
        
        // Reset global alpha
        ctx.globalAlpha = 1;
        
        // Render weapon UI
        this.renderWeaponUI(ctx);
    }
    
    // Render weapon UI (ammo count, active weapon, etc.)
    renderWeaponUI(ctx) {
        const player = this.game.localPlayer;
        if (!player || !player.equipment || player.equipment.length === 0) return;
        
        const weapon = player.equipment[player.activeWeaponIndex];
        if (!weapon) return;
        
        // Set up text style
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        
        // Render weapon name
        ctx.fillText(weapon.name, ctx.canvas.width - 20, ctx.canvas.height - 60);
        
        // Render ammo count
        ctx.font = '24px Arial';
        ctx.fillText(
            `${weapon.currentAmmo} / ${weapon.reserveAmmo}`, 
            ctx.canvas.width - 20, 
            ctx.canvas.height - 30
        );
        
        // Show reloading indicator
        if (weapon.isReloading) {
            ctx.fillStyle = '#ffaa00';
            ctx.textAlign = 'center';
            ctx.fillText('RELOADING', ctx.canvas.width / 2, ctx.canvas.height - 100);
        }
    }
    
    // Add a weapon to player's inventory
    giveWeapon(player, weaponId) {
        // Create the weapon
        const weapon = WeaponCatalog.createWeapon(weaponId);
        if (!weapon) return false;
        
        // Check if player already has a weapon of this type
        const existingIndex = player.equipment.findIndex(w => w.type === weapon.type);
        
        if (existingIndex >= 0) {
            // Replace existing weapon of the same type
            player.equipment[existingIndex] = weapon;
            
            // If active weapon was replaced, update index
            if (player.activeWeaponIndex === existingIndex) {
                // Switch to the new weapon
                player.activeWeaponIndex = existingIndex;
            }
        } else {
            // Add as a new weapon
            player.equipment.push(weapon);
            
            // Automatically switch to new weapon
            player.activeWeaponIndex = player.equipment.length - 1;
        }
        
        // Sync weapon changes
        this.syncPlayerEquipment(player);
        
        return true;
    }
    
    // Sync player's equipment to server
    syncPlayerEquipment(player) {
        if (!player || !this.game.roomManager.activeRoom) return;
        
        const normalizedEquipment = [];
        
        if (player.equipment && Array.isArray(player.equipment)) {
            for (const item of player.equipment) {
                if (item) {
                    normalizedEquipment.push({
                        id: item.id,
                        currentAmmo: item.currentAmmo,
                        reserveAmmo: item.reserveAmmo,
                        type: item.type,
                        isReloading: item.isReloading
                    });
                }
            }
        }
        
        const playerRef = this.game.database.ref(
            `rooms/${this.game.roomManager.activeRoom}/players/${player.id}`
        );
        
        // Only update equipment and active weapon index, not the entire player object
        playerRef.update({
            equipment: normalizedEquipment,
            activeWeaponIndex: player.activeWeaponIndex
        });
    }
    
    // Initialize player weapons on join/respawn
    initializeDefaultWeapon(player) {
        // Clear current equipment
        player.equipment = [];
        
        // Give default starter pistol - use consistent uppercase ID
        this.giveWeapon(player, 'STARTER_PISTOL');
        
        // Set active weapon to the pistol
        player.activeWeaponIndex = 0;
        
        // Sync changes if this is the local player
        if (player.id === this.game.localPlayer.id) {
            this.syncPlayerEquipment(player);
        }
    }
    
    // Called when player respawns in a new round
    handlePlayerRespawn(player) {
        if (!player) return;
        
        // Reset equipment
        player.equipment = [];
        
        // Give default weapon
        this.giveWeapon(player, 'STARTER_PISTOL');
        
        // Set active weapon
        player.activeWeaponIndex = 0;
        
        // Sync if it's the local player
        if (player.id === this.game.localPlayer.id) {
            this.syncPlayerEquipment(player);
        }
    }
    
    // Add this method to reconstruct weapons from network data
    reconstructWeaponsFromNetworkData(player, equipmentData) {
        if (!player || !equipmentData || !Array.isArray(equipmentData)) {
            return;
        }
        
        // Clear current equipment
        player.equipment = [];
        
        // Reconstruct each weapon
        for (const item of equipmentData) {
            if (!item || !item.id) continue;
            
            // Create a fresh weapon instance from the catalog
            const weapon = WeaponCatalog.createWeapon(item.id);
            
            if (weapon) {
                // Copy over the synchronized state
                weapon.currentAmmo = item.currentAmmo || 0;
                weapon.reserveAmmo = item.reserveAmmo || 0;
                weapon.isReloading = item.isReloading || false;
                
                // Add to player equipment
                player.equipment.push(weapon);
            }
        }
        
        // Ensure activeWeaponIndex is valid
        if (!player.equipment.length) {
            // If no weapons, give default
            this.initializeDefaultWeapon(player);
        } else if (player.activeWeaponIndex >= player.equipment.length) {
            player.activeWeaponIndex = 0;
        }
    }
    
    // Add a method for hit visual effects
    addHitEffect(damageData) {
        const { targetId, damage } = damageData;
        
        // Find the target player
        let targetPlayer = null;
        
        if (this.game.localPlayer && this.game.localPlayer.id === targetId) {
            targetPlayer = this.game.localPlayer;
        } else {
            targetPlayer = this.game.players.get(targetId);
        }
        
        if (!targetPlayer) return;
        
        // Add a floating damage number
        const damageText = {
            text: `-${damage}`,
            x: targetPlayer.x,
            y: targetPlayer.y - 30,
            color: '#ff3333',
            size: 16,
            opacity: 1,
            velocity: { x: 0, y: -1 },
            createdAt: Date.now(),
            duration: 1000 // Show for 1 second
        };
        
        if (!this.damageTexts) {
            this.damageTexts = [];
        }
        
        this.damageTexts.push(damageText);
        
        // Add hit marker at player position
        this.addHitMarker(targetPlayer.x, targetPlayer.y);
    }
}

// Make CombatManager globally available
window.CombatManager = CombatManager; 