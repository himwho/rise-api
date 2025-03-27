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
      doorOpenTime: 5000, // ms
      floorTravelTime: 3000, // 3 seconds per floor
      prioritizationMode: 'equal', // 'equal', 'tenant-priority', or 'bot-priority'
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
    };

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
  requestFloor(floorNumber, requesterType) {
    if (floorNumber < 1 || floorNumber > this.config.floors) {
      throw new Error(`Invalid floor number: ${floorNumber}`);
    }

    console.log(`Elevator ${this.config.id} received request for floor ${floorNumber} from ${requesterType || 'unknown'}`);

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
    this.updateTargetFloor();
    
    // Track bot and tenant requests with timestamps for priority handling
    if (requesterType === 'bot') {
      if (!this.pendingBotRequests) {
        this.pendingBotRequests = [];
      }
      
      this.pendingBotRequests.push({
        floor: floorNumber,
        timestamp: Date.now()
      });
      
      console.log(`Added bot request for floor ${floorNumber} to priority queue`);
    } else if (requesterType === 'tenant') {
      if (!this.pendingTenantRequests) {
        this.pendingTenantRequests = [];
      }
      
      this.pendingTenantRequests.push({
        floor: floorNumber,
        timestamp: Date.now()
      });
    }
    
    return true;
  }

  updateTargetFloor() {
    // If already moving, don't change target
    if (this.state.inMotion) {
      return;
    }
    
    // If no requests, nothing to do
    if (this.state.floorRequests.size === 0) {
      this.state.targetFloor = null;
      return;
    }
    
    // Handle different prioritization modes
    switch (this.config.prioritizationMode) {
      case 'bot-priority':
        // Always prioritize bot requests first
        if (this.pendingBotRequests && this.pendingBotRequests.length > 0) {
          const botRequest = this.pendingBotRequests[0];
          console.log(`Prioritizing bot request for floor ${botRequest.floor} (bot-priority mode)`);
          
          this.state.targetFloor = botRequest.floor;
          this.moveToTargetFloor();
          return;
        }
        break;
        
      case 'tenant-priority':
        // Only handle bot requests if there are no tenant requests
        if (this.pendingTenantRequests && this.pendingTenantRequests.length > 0) {
          const tenantRequest = this.pendingTenantRequests[0];
          console.log(`Prioritizing tenant request for floor ${tenantRequest.floor} (tenant-priority mode)`);
          
          this.state.targetFloor = tenantRequest.floor;
          this.moveToTargetFloor();
          return;
        }
        break;
        
      case 'equal':
      default:
        // Equal priority - use the standard algorithm
        break;
    }
    
    // Standard algorithm for handling requests (used for 'equal' mode or as fallback)
    // Convert set to array for easier processing
    const requests = Array.from(this.state.floorRequests);
    
    // If we're stationary, go to the closest floor
    if (this.state.direction === 'STATIONARY') {
      let closestFloor = requests[0];
      let minDistance = Math.abs(closestFloor - this.state.currentFloor);
      
      for (const floor of requests) {
        const distance = Math.abs(floor - this.state.currentFloor);
        if (distance < minDistance) {
          minDistance = distance;
          closestFloor = floor;
        }
      }
      
      this.state.targetFloor = closestFloor;
      this.moveToTargetFloor();
      return;
    }
    
    // Find the closest floor in the direction we're already moving
    let closestFloor = null;
    let minDistance = Infinity;
    
    for (const floor of requests) {
      const distance = Math.abs(floor - this.state.currentFloor);
      
      // If this is a new closest floor, or it's the same distance but in our current direction
      if (distance < minDistance || 
          (distance === minDistance && 
           ((this.state.direction === 'UP' && floor > this.state.currentFloor) || 
            (this.state.direction === 'DOWN' && floor < this.state.currentFloor)))) {
        closestFloor = floor;
        minDistance = distance;
      }
    }
    
    this.state.targetFloor = closestFloor;
    this.moveToTargetFloor();
  }

  moveToTargetFloor() {
    if (this.state.targetFloor === null || this.state.inMotion) {
      return;
    }
    
    // If already at target floor, open door
    if (this.state.currentFloor === this.state.targetFloor) {
      if (this.state.doorState === 'CLOSED') {
        this.openDoor();
      }
      return;
    }
    
    // Set direction
    if (this.state.targetFloor > this.state.currentFloor) {
      this.state.direction = 'UP';
    } else {
      this.state.direction = 'DOWN';
    }
    
    // Start moving
    this.state.inMotion = true;
    
    // Update object dictionary
    this.objectDictionary[0x6000].value |= 0x4; // Set in motion bit
    if (this.state.direction === 'UP') {
      this.objectDictionary[0x6000].value |= 0x20; // Set direction up bit
      this.objectDictionary[0x6000].value &= ~0x40; // Clear direction down bit
    } else {
      this.objectDictionary[0x6000].value |= 0x40; // Set direction down bit
      this.objectDictionary[0x6000].value &= ~0x20; // Clear direction up bit
    }
    
    // Notify listeners
    this.notifyListeners('directionChanged', this.state.direction);
    
    // Calculate travel time based on number of floors to travel
    const floorsToTravel = Math.abs(this.state.targetFloor - this.state.currentFloor);
    const travelTime = floorsToTravel * this.config.floorTravelTime;
    
    console.log(`Elevator ${this.config.id} moving ${this.state.direction} from floor ${this.state.currentFloor} to ${this.state.targetFloor}`);
    
    // Clear any existing movement timer
    if (this.movementTimer) {
      clearTimeout(this.movementTimer);
    }
    
    // Set timer for arrival
    this.movementTimer = setTimeout(() => {
      // Arrive at target floor
      this.state.currentFloor = this.state.targetFloor;
      this.state.inMotion = false;
      this.state.direction = 'STATIONARY';
      
      // Update object dictionary
      this.objectDictionary[0x6001].value = this.state.currentFloor;
      this.objectDictionary[0x6000].value &= ~0x4; // Clear in motion bit
      this.objectDictionary[0x6000].value &= ~0x20; // Clear direction up bit
      this.objectDictionary[0x6000].value &= ~0x40; // Clear direction down bit
      
      // Remove from pending bot and tenant requests
      if (this.pendingBotRequests) {
        this.pendingBotRequests = this.pendingBotRequests.filter(req => req.floor !== this.state.currentFloor);
      }
      
      if (this.pendingTenantRequests) {
        this.pendingTenantRequests = this.pendingTenantRequests.filter(req => req.floor !== this.state.currentFloor);
      }
      
      // Notify listeners
      this.notifyListeners('floorChanged', this.state.currentFloor);
      this.notifyListeners('directionChanged', this.state.direction);
      
      console.log(`Elevator ${this.config.id} arrived at floor ${this.state.currentFloor}`);
      
      // Open door immediately
      this.openDoor();
      
      // Check for more requests after a delay
      setTimeout(() => {
        this.updateTargetFloor();
      }, this.config.doorOpenTime + 1000);
    }, travelTime);
  }

  openDoor() {
    if (this.state.doorState === 'OPEN' || this.state.doorState === 'OPENING') {
      return;
    }
    
    clearTimeout(this.doorTimer);
    this.state.doorState = 'OPENING';
    this.objectDictionary[0x6000].value |= 0x2; // Set door opening bit
    this.notifyListeners('doorStateChanged', this.state.doorState);
    
    // Simulate door opening
    setTimeout(() => {
      this.state.doorState = 'OPEN';
      this.objectDictionary[0x6000].value &= ~0x2; // Clear door opening bit
      this.objectDictionary[0x6000].value |= 0x1; // Set door open bit
      this.notifyListeners('doorStateChanged', this.state.doorState);
    }, 1500);
  }

  closeDoor() {
    if (this.state.doorState === 'CLOSED' || this.state.doorState === 'CLOSING' || this.state.doorObstruction) {
      return;
    }
    
    this.state.doorState = 'CLOSING';
    this.objectDictionary[0x6000].value &= ~0x1; // Clear door open bit
    this.objectDictionary[0x6000].value |= 0x8; // Set door closing bit
    this.notifyListeners('doorStateChanged', this.state.doorState);
    
    // Simulate door closing
    setTimeout(() => {
      this.state.doorState = 'CLOSED';
      this.objectDictionary[0x6000].value &= ~0x8; // Clear door closing bit
      this.objectDictionary[0x6000].value |= 0x10; // Set door closed bit
      this.notifyListeners('doorStateChanged', this.state.doorState);
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
}

module.exports = VirtualElevator; 