/**
 * VirtualElevator.js
 * 
 * Implementation of a virtual elevator using the CANopen Elevator Protocol (CiA 417)
 */

class VirtualElevator {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      id: 'elevator-1',
      floors: 10,
      doorOpenTime: 5000, // 5000ms (5 seconds)
      floorTravelTime: 2000, // 2 seconds per floor
      prioritizationMode: 'equal', // 'equal', 'tenant-priority', or 'bot-priority'
      maxOccupants: 8, // Maximum number of occupants in the elevator
      ...config
    };

    // Elevator state
    this.state = {
      currentFloor: 1,
      targetFloor: null,
      doorState: 'CLOSED', // CLOSED, OPEN, OPENING, CLOSING
      direction: 'STATIONARY', // UP, DOWN, STATIONARY
      inMotion: false,
      emergencyState: false,
      doorObstruction: false,
      floorRequests: new Set(),
      occupants: [], // Track occupants and their destinations
    };

    // Track waiting tenants
    this.waitingTenants = [];

    // CANopen Object Dictionary (simplified for simulation)
    this.objectDictionary = {
      // Device Type
      0x1000: { value: 0x191, access: 'ro' }, // CiA 417 device profile

      // Manufacturer Status Register
      0x1002: { value: 0x0, access: 'ro' },

      // Error Register
      0x1001: { value: 0x0, access: 'ro' },

      // Elevator status
      0x6000: { value: 0x0, access: 'ro' }, // Bit 0: Door closed, Bit 1: Door opening, etc.

      // Current floor
      0x6001: { value: this.state.currentFloor, access: 'ro' },

      // Target floor
      0x6002: { value: 0, access: 'rw' },

      // Door command
      0x6010: { value: 0, access: 'rw' }, // 0: Close, 1: Open
    };

    this.eventListeners = {
      'floorChanged': [],
      'doorStateChanged': [],
      'directionChanged': [],
      'emergencyStateChanged': [],
    };

    // Timers
    this.doorTimer = null;
    this.movementTimer = null;
  }

  // CANopen communication methods
  readObject(index) {
    if (this.objectDictionary[index]) {
      return this.objectDictionary[index].value;
    }
    throw new Error(`Object ${index.toString(16)} not found in dictionary`);
  }

  writeObject(index, value) {
    if (this.objectDictionary[index] && this.objectDictionary[index].access === 'rw') {
      this.objectDictionary[index].value = value;
      
      // Handle specific objects
      if (index === 0x6002) { // Target floor
        this.requestFloor(value);
      } else if (index === 0x6010) { // Door command
        if (value === 1) {
          this.openDoor();
        } else {
          this.closeDoor();
        }
      }
      
      return true;
    }
    throw new Error(`Cannot write to object ${index.toString(16)}`);
  }

  // Elevator control methods
  requestFloor(floorNumber, requesterType, occupantId = null, destination = null) {
    if (floorNumber < 1 || floorNumber > this.config.floors) {
      throw new Error(`Invalid floor number: ${floorNumber}`);
    }

    console.log(`Elevator ${this.config.id} received request for floor ${floorNumber} from ${requesterType || 'unknown'}`);
    
    // Debug state before processing request
    this.debugState();

    console.log(`Elevator state: Floor ${this.state.currentFloor}, Door ${this.state.doorState}, Direction ${this.state.direction}, In Motion: ${this.state.inMotion}`);
    console.log(`Current requests: ${Array.from(this.state.floorRequests).join(', ')}`);

    // Check if elevator is at capacity when a new occupant tries to enter
    if (requesterType && 
        this.state.currentFloor === floorNumber && 
        this.state.doorState === 'OPEN' && 
        !this.isOccupantInElevator(occupantId)) {
      
      // If elevator is at capacity, reject new occupants
      if (this.state.occupants.length >= this.config.maxOccupants) {
        console.log(`Elevator ${this.config.id} is at maximum capacity (${this.config.maxOccupants}), cannot accept new occupant`);
        return false;
      }
      
      // Add occupant to the elevator with destination
      this.addOccupant(occupantId || `occupant-${Date.now()}`, requesterType, destination);
      console.log(`Elevator ${this.config.id} is already at floor ${floorNumber} with door open - immediate pickup for ${requesterType || 'occupant'}`);
    } else if (requesterType === 'tenant' && floorNumber !== this.state.currentFloor) {
      // Track waiting tenant
      const tenantId = occupantId || `tenant-${Date.now()}`;
      
      // Add to waiting tenants if not already there
      if (!this.waitingTenants.some(t => t.id === tenantId)) {
        this.waitingTenants.push({
          id: tenantId,
          floor: floorNumber,
          destination: destination,
          requestTime: Date.now()
        });
        
        console.log(`Added tenant ${tenantId} to waiting list for floor ${floorNumber}`);
      }
    }

    // Track statistics
    if (requesterType) {
      // Initialize counters if they don't exist
      if (this.totalRequests === undefined) {
        this.totalRequests = 0;
        this.botRequests = 0;
        this.tenantRequests = 0;
      }
      
      this.totalRequests++;
      
      if (requesterType === 'bot') {
        this.botRequests++;
        console.log(`Elevator ${this.config.id} bot request count: ${this.botRequests}`);
      } else if (requesterType === 'tenant') {
        this.tenantRequests++;
      }
    }

    // Add to floor requests
    this.state.floorRequests.add(floorNumber);
    
    // Track bot and tenant requests with timestamps for priority handling
    if (requesterType === 'bot') {
      if (!this.pendingBotRequests) {
        this.pendingBotRequests = [];
      }
      
      this.pendingBotRequests.push({
        floor: floorNumber,
        timestamp: Date.now(),
        occupantId: occupantId,
        destination: destination
      });
      
      console.log(`Added bot request for floor ${floorNumber} to priority queue`);
    } else if (requesterType === 'tenant') {
      if (!this.pendingTenantRequests) {
        this.pendingTenantRequests = [];
      }
      
      this.pendingTenantRequests.push({
        floor: floorNumber,
        timestamp: Date.now(),
        occupantId: occupantId,
        destination: destination
      });
      
      console.log(`Added tenant request for floor ${floorNumber} to queue`);
    }
    
    // Update target floor immediately if not in motion and no target
    if (!this.state.inMotion && (this.state.targetFloor === null || this.state.targetFloor === this.state.currentFloor)) {
      console.log(`Elevator ${this.config.id} updating target floor after request`);
      this.updateTargetFloor();
    } else {
      console.log(`Elevator ${this.config.id} is in motion or has a target, will process request for floor ${floorNumber} after current trip`);
    }
    
    // Debug state after processing request
    this.debugState();
    
    return true;
  }

  updateTargetFloor() {
    // If no requests, nothing to do
    if (this.state.floorRequests.size === 0) {
      this.state.targetFloor = null;
      this.state.direction = 'STATIONARY';
      this.notifyListeners('directionChanged', this.state.direction);
      console.log(`Elevator ${this.config.id} has no pending requests`);
      return;
    }
    
    // Convert requests to array for easier processing
    const requests = Array.from(this.state.floorRequests);
    console.log(`Elevator ${this.config.id} processing requests: ${requests.join(', ')}`);
    
    // If already moving, don't change target unless we're at the target floor
    if (this.state.inMotion) {
      console.log(`Elevator ${this.config.id} is already in motion to floor ${this.state.targetFloor}`);
      return;
    }
    
    // If we have a target but aren't moving yet, keep that target
    if (this.state.targetFloor !== null && this.state.targetFloor !== this.state.currentFloor) {
      console.log(`Elevator ${this.config.id} already has target floor ${this.state.targetFloor}`);
      this.moveToTargetFloor();
      return;
    }
    
    // Implement Selective Collective Operation logic
    
    // If we have a direction, continue in that direction if there are requests
    if (this.state.direction === 'UP') {
      // Find floors above current floor
      const floorsAbove = requests.filter(floor => floor > this.state.currentFloor).sort((a, b) => a - b);
      
      if (floorsAbove.length > 0) {
        // Continue going up to the next floor above
        this.state.targetFloor = floorsAbove[0];
        console.log(`Elevator ${this.config.id} continuing UP to floor ${this.state.targetFloor}`);
        this.moveToTargetFloor();
        return;
      } else {
        // No more floors above, change direction if there are floors below
        const floorsBelow = requests.filter(floor => floor < this.state.currentFloor).sort((a, b) => b - a);
        
        if (floorsBelow.length > 0) {
          // Change direction to go down
          this.state.direction = 'DOWN';
          this.notifyListeners('directionChanged', this.state.direction);
          this.state.targetFloor = floorsBelow[0];
          console.log(`Elevator ${this.config.id} changing direction to DOWN, going to floor ${this.state.targetFloor}`);
          this.moveToTargetFloor();
          return;
        }
      }
    } else if (this.state.direction === 'DOWN') {
      // Find floors below current floor
      const floorsBelow = requests.filter(floor => floor < this.state.currentFloor).sort((a, b) => b - a);
      
      if (floorsBelow.length > 0) {
        // Continue going down to the next floor below
        this.state.targetFloor = floorsBelow[0];
        console.log(`Elevator ${this.config.id} continuing DOWN to floor ${this.state.targetFloor}`);
        this.moveToTargetFloor();
        return;
      } else {
        // No more floors below, change direction if there are floors above
        const floorsAbove = requests.filter(floor => floor > this.state.currentFloor).sort((a, b) => a - b);
        
        if (floorsAbove.length > 0) {
          // Change direction to go up
          this.state.direction = 'UP';
          this.notifyListeners('directionChanged', this.state.direction);
          this.state.targetFloor = floorsAbove[0];
          console.log(`Elevator ${this.config.id} changing direction to UP, going to floor ${this.state.targetFloor}`);
          this.moveToTargetFloor();
          return;
        }
      }
    } else {
      // No current direction (STATIONARY), pick the closest floor
      let closestFloor = requests[0];
      let minDistance = Math.abs(closestFloor - this.state.currentFloor);
      
      for (const floor of requests) {
        const distance = Math.abs(floor - this.state.currentFloor);
        if (distance < minDistance) {
          minDistance = distance;
          closestFloor = floor;
        }
      }
      
      // Set direction based on the selected floor
      this.state.direction = closestFloor > this.state.currentFloor ? 'UP' : 'DOWN';
      if (closestFloor === this.state.currentFloor) {
        this.state.direction = 'STATIONARY';
      }
      
      this.notifyListeners('directionChanged', this.state.direction);
      this.state.targetFloor = closestFloor;
      console.log(`Elevator ${this.config.id} starting from STATIONARY, going ${this.state.direction} to floor ${this.state.targetFloor}`);
      this.moveToTargetFloor();
      return;
    }
    
    // If we get here, there's a problem with the request logic
    console.error(`Elevator ${this.config.id} couldn't determine next floor. Current floor: ${this.state.currentFloor}, Requests: ${requests.join(', ')}`);
    
    // As a fallback, just pick the first request
    if (requests.length > 0) {
      this.state.targetFloor = requests[0];
      this.state.direction = this.state.targetFloor > this.state.currentFloor ? 'UP' : 'DOWN';
      if (this.state.targetFloor === this.state.currentFloor) {
        this.state.direction = 'STATIONARY';
      }
      
      this.notifyListeners('directionChanged', this.state.direction);
      console.log(`Elevator ${this.config.id} fallback: going to floor ${this.state.targetFloor}`);
      this.moveToTargetFloor();
    } else {
      // This shouldn't happen, but just in case
      this.state.targetFloor = null;
      this.state.direction = 'STATIONARY';
      this.notifyListeners('directionChanged', this.state.direction);
      console.log(`Elevator ${this.config.id} has no pending requests (fallback)`);
    }
  }

  moveToTargetFloor() {
    if (this.state.targetFloor === null) {
      console.log(`Elevator ${this.config.id} has no target floor to move to`);
      return;
    }
    
    // If already at target floor, just open the door
    if (this.state.currentFloor === this.state.targetFloor) {
      console.log(`Elevator ${this.config.id} is already at target floor ${this.state.targetFloor}`);
      if (this.state.doorState === 'CLOSED') {
        this.openDoor();
      }
      return;
    }
    
    // Determine direction
    const direction = this.state.targetFloor > this.state.currentFloor ? 'UP' : 'DOWN';
    this.state.direction = direction;
    this.notifyListeners('directionChanged', direction);
    
    // Update object dictionary
    if (direction === 'UP') {
      this.objectDictionary[0x6000].value |= 0x20; // Set direction up bit
      this.objectDictionary[0x6000].value &= ~0x40; // Clear direction down bit
    } else {
      this.objectDictionary[0x6000].value &= ~0x20; // Clear direction up bit
      this.objectDictionary[0x6000].value |= 0x40; // Set direction down bit
    }
    
    // Close door if open
    if (this.state.doorState === 'OPEN' || this.state.doorState === 'OPENING') {
      console.log(`Elevator ${this.config.id} closing door before moving`);
      this.closeDoor();
      
      // Wait for door to close before moving
      setTimeout(() => {
        this.startMovement();
      }, 2000);
    } else {
      this.startMovement();
    }
  }

  startMovement() {
    // Set in motion
    this.state.inMotion = true;
    this.objectDictionary[0x6000].value |= 0x4; // Set in motion bit
    
    // Calculate travel time
    const floorsToTravel = Math.abs(this.state.targetFloor - this.state.currentFloor);
    const travelTime = floorsToTravel * this.config.floorTravelTime;
    
    console.log(`Elevator ${this.config.id} moving ${this.state.direction} from floor ${this.state.currentFloor} to ${this.state.targetFloor} (${travelTime}ms)`);
    
    // Clear any existing movement timer
    if (this.movementTimer) {
      clearTimeout(this.movementTimer);
    }
    
    // Simulate movement
    this.movementTimer = setTimeout(() => {
      // Update state
      this.state.currentFloor = this.state.targetFloor;
      this.state.inMotion = false;
      
      // Update object dictionary
      this.objectDictionary[0x6001].value = this.state.currentFloor;
      this.objectDictionary[0x6000].value &= ~0x4; // Clear in motion bit
      
      console.log(`Elevator ${this.config.id} arrived at floor ${this.state.currentFloor}`);
      
      // Notify listeners
      this.notifyListeners('floorChanged', this.state.currentFloor);
      
      // Open door immediately
      this.openDoor();
      
      // Remove this floor from requests
      this.state.floorRequests.delete(this.state.currentFloor);
      
      // Handle occupants exiting at this floor
      const exitingOccupants = this.state.occupants.filter(o => o.destination === this.state.currentFloor);
      if (exitingOccupants.length > 0) {
        console.log(`${exitingOccupants.length} occupants exiting at floor ${this.state.currentFloor}`);
        
        // Add a small delay to simulate occupants exiting
        setTimeout(() => {
          exitingOccupants.forEach(occupant => {
            console.log(`Occupant ${occupant.id} exiting at floor ${this.state.currentFloor}`);
            this.removeOccupant(occupant.id);
          });
        }, 1000);
      }
      
      // Keep door open longer to allow multiple occupants to enter/exit
      const doorOpenTime = this.config.doorOpenTime;
      
      // Check for more requests after door open time
      setTimeout(() => {
        // Check if there are more requests for this floor before moving
        const moreRequestsForThisFloor = Array.from(this.state.floorRequests).includes(this.state.currentFloor);
        
        if (moreRequestsForThisFloor) {
          console.log(`Elevator ${this.config.id} waiting for more occupants at floor ${this.state.currentFloor}`);
          // Keep door open and check again later
          setTimeout(() => {
            this.updateTargetFloor();
          }, 3000);
        } else {
          // Continue to next floor based on selective collective logic
          this.updateTargetFloor();
        }
      }, doorOpenTime);
    }, travelTime);
  }

  openDoor() {
    if (this.state.doorState === 'OPEN') {
      return; // Door already open
    }
    
    console.log(`Elevator ${this.config.id} opening door at floor ${this.state.currentFloor}`);
    
    // Set door state to opening
    this.state.doorState = 'OPENING';
    this.objectDictionary[0x6000].value |= 0x2; // Set door opening bit
    this.objectDictionary[0x6000].value &= ~0x10; // Clear door closed bit
    
    this.notifyListeners('doorStateChanged', this.state.doorState);
    
    // Simulate door opening time
    setTimeout(() => {
      this.state.doorState = 'OPEN';
      this.objectDictionary[0x6000].value &= ~0x2; // Clear door opening bit
      this.objectDictionary[0x6000].value |= 0x1; // Set door open bit
      
      this.notifyListeners('doorStateChanged', this.state.doorState);
      
      // Clean up the request for this floor
      this.state.floorRequests.delete(this.state.currentFloor);
      
      // Clean up any stale requests
      this.cleanupStaleRequests();
      
      // Check for waiting tenants at this floor
      const waitingTenantsAtThisFloor = this.waitingTenants.filter(t => t.floor === this.state.currentFloor);
      if (waitingTenantsAtThisFloor.length > 0) {
        console.log(`${waitingTenantsAtThisFloor.length} tenants waiting at floor ${this.state.currentFloor}`);
        
        // Keep door open longer for tenants to enter
        if (this.doorTimer) {
          clearTimeout(this.doorTimer);
        }
        
        // Set a longer door open time when tenants are waiting
        this.doorTimer = setTimeout(() => {
          // Only close the door if there are no obstructions
          if (!this.state.doorObstruction) {
            this.closeDoor();
          }
        }, this.config.doorOpenTime * 2);
      } else {
        // Set a timer to close the door after a delay
        if (this.doorTimer) {
          clearTimeout(this.doorTimer);
        }
        
        this.doorTimer = setTimeout(() => {
          // Only close the door if there are no obstructions
          if (!this.state.doorObstruction) {
            this.closeDoor();
          }
        }, this.config.doorOpenTime);
      }
    }, 1500);
  }

  closeDoor() {
    if (this.state.doorState === 'CLOSED') {
      return; // Door already closed
    }
    
    console.log(`Elevator ${this.config.id} closing door at floor ${this.state.currentFloor}`);
    
    // Set door state to closing
    this.state.doorState = 'CLOSING';
    this.objectDictionary[0x6000].value |= 0x8; // Set door closing bit
    this.objectDictionary[0x6000].value &= ~0x1; // Clear door open bit
    
    this.notifyListeners('doorStateChanged', this.state.doorState);
    
    // Simulate door closing time
    setTimeout(() => {
      this.state.doorState = 'CLOSED';
      this.objectDictionary[0x6000].value &= ~0x8; // Clear door closing bit
      this.objectDictionary[0x6000].value |= 0x10; // Set door closed bit
      
      this.notifyListeners('doorStateChanged', this.state.doorState);
      
      // If we have a target floor different from current floor, start moving
      if (this.state.targetFloor !== null && this.state.targetFloor !== this.state.currentFloor && !this.state.inMotion) {
        console.log(`Elevator ${this.config.id} door closed, starting movement to floor ${this.state.targetFloor}`);
        this.startMovement();
      }
    }, 1500);
  }

  setDoorObstruction(obstructed) {
    this.state.doorObstruction = obstructed;
    
    if (obstructed && this.state.doorState === 'CLOSING') {
      // Reopen door if obstruction detected while closing
      this.openDoor();
    }
  }

  setEmergencyState(emergency) {
    this.state.emergencyState = emergency;
    this.objectDictionary[0x1002].value = emergency ? 0x1 : 0x0;
    
    if (emergency) {
      // Stop all movement
      clearTimeout(this.movementTimer);
      this.state.inMotion = false;
      this.state.direction = 'STATIONARY';
    }
    
    this.notifyListeners('emergencyStateChanged', emergency);
  }

  // Event handling
  addEventListener(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  removeEventListener(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  }

  notifyListeners(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  // Get current state
  getState() {
    return { ...this.state };
  }

  // Add methods to track occupants
  addOccupant(occupantId, type, destination = null) {
    // Check if occupant is already in elevator
    if (this.isOccupantInElevator(occupantId)) {
      return;
    }
    
    // If no destination is provided, set a default destination
    // For tenants coming from lobby (floor 1), go to a random upper floor
    // For tenants coming from upper floors, go to lobby (floor 1)
    if (destination === null) {
      if (this.state.currentFloor === 1) {
        // Coming from lobby, go to random upper floor
        destination = Math.floor(Math.random() * (this.config.floors - 1)) + 2;
      } else {
        // Coming from upper floor, go to lobby
        destination = 1;
      }
      console.log(`Assigning default destination floor ${destination} for occupant ${occupantId}`);
    }
    
    // Add occupant to elevator
    this.state.occupants.push({
      id: occupantId,
      type: type,
      enteredAt: this.state.currentFloor,
      destination: destination
    });
    
    // Make sure the destination floor is requested
    this.state.floorRequests.add(destination);
    
    console.log(`Occupant ${occupantId} entered elevator at floor ${this.state.currentFloor} with destination ${destination}`);
  }

  removeOccupant(occupantId) {
    // Remove occupant from elevator
    const index = this.state.occupants.findIndex(o => o.id === occupantId);
    if (index !== -1) {
      const occupant = this.state.occupants[index];
      console.log(`Occupant ${occupantId} exited elevator at floor ${this.state.currentFloor}, entered at floor ${occupant.enteredAt}`);
      this.state.occupants.splice(index, 1);
      
      // Remove from waiting tenants if present
      this.waitingTenants = this.waitingTenants.filter(t => t.id !== occupantId);
      
      // Clean up any stale requests
      this.cleanupStaleRequests();
    }
  }

  isOccupantInElevator(occupantId) {
    return this.state.occupants.some(o => o.id === occupantId);
  }

  setOccupantDestination(occupantId, destinationFloor) {
    // Set destination for occupant
    const occupant = this.state.occupants.find(o => o.id === occupantId);
    if (occupant) {
      occupant.destination = destinationFloor;
      console.log(`Occupant ${occupantId} set destination to floor ${destinationFloor}`);
      
      // Make sure the destination floor is requested
      this.state.floorRequests.add(destinationFloor);
    } else {
      console.log(`Warning: Tried to set destination for occupant ${occupantId} who is not in the elevator`);
    }
  }

  // Add a method to clean up stale requests
  cleanupStaleRequests() {
    // Check if there are any requests for the current floor
    if (this.state.floorRequests.has(this.state.currentFloor)) {
      console.log(`Cleaning up request for current floor ${this.state.currentFloor}`);
      this.state.floorRequests.delete(this.state.currentFloor);
    }
    
    // Check if there are any requests that don't have corresponding occupants
    const occupantDestinations = this.state.occupants.map(o => o.destination);
    
    // Get all requests that aren't for the current floor and aren't occupant destinations
    const staleRequests = Array.from(this.state.floorRequests).filter(floor => 
      floor !== this.state.currentFloor && !occupantDestinations.includes(floor)
    );
    
    // Check if any of these requests are stale (no waiting tenants)
    staleRequests.forEach(floor => {
      // Check if there are any waiting tenants for this floor
      const waitingTenants = this.waitingTenants ? this.waitingTenants.filter(t => t.floor === floor) : [];
      
      if (waitingTenants.length === 0) {
        console.log(`Cleaning up stale request for floor ${floor} (no waiting tenants)`);
        this.state.floorRequests.delete(floor);
      }
    });
  }

  // Add a debug method to log the elevator state
  debugState() {
    console.log(`\n=== Elevator ${this.config.id} Debug State ===`);
    console.log(`Current Floor: ${this.state.currentFloor}`);
    console.log(`Target Floor: ${this.state.targetFloor}`);
    console.log(`Door State: ${this.state.doorState}`);
    console.log(`Direction: ${this.state.direction}`);
    console.log(`In Motion: ${this.state.inMotion}`);
    console.log(`Floor Requests: ${Array.from(this.state.floorRequests).join(', ')}`);
    console.log(`Occupants: ${this.state.occupants.length}`);
    this.state.occupants.forEach(o => {
      console.log(`  - ${o.id} (${o.type}): Destination ${o.destination}`);
    });
    console.log(`Waiting Tenants: ${this.waitingTenants.length}`);
    this.waitingTenants.forEach(t => {
      console.log(`  - ${t.id}: Floor ${t.floor}, Destination ${t.destination}`);
    });
    console.log('===================================\n');
  }
}

module.exports = VirtualElevator; 