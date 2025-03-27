/**
 * VirtualElevator.js
 * 
 * Implementation of a virtual elevator using the CANopen Elevator Protocol (CiA 417)
 */

class VirtualElevator {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      floors: 10,
      doorOpenTime: 5000, // ms
      floorTravelTime: 2000, // ms per floor
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
  requestFloor(floorNumber) {
    if (floorNumber < 1 || floorNumber > this.config.floors) {
      throw new Error(`Invalid floor number: ${floorNumber}`);
    }

    this.state.floorRequests.add(floorNumber);
    this.updateTargetFloor();
    
    return true;
  }

  updateTargetFloor() {
    if (this.state.floorRequests.size === 0 || this.state.inMotion) {
      return;
    }

    // Simple algorithm: take the next request in the current direction
    // or change direction if no requests in current direction
    const requests = Array.from(this.state.floorRequests);
    
    if (this.state.direction === 'STATIONARY') {
      // If stationary, choose closest request
      const closest = requests.reduce((prev, curr) => 
        Math.abs(curr - this.state.currentFloor) < Math.abs(prev - this.state.currentFloor) 
          ? curr 
          : prev
      );
      
      this.state.targetFloor = closest;
      this.state.direction = closest > this.state.currentFloor ? 'UP' : 
                            closest < this.state.currentFloor ? 'DOWN' : 'STATIONARY';
    } else {
      // Continue in current direction if possible
      const nextInDirection = this.state.direction === 'UP' 
        ? requests.filter(f => f > this.state.currentFloor).sort((a, b) => a - b)[0]
        : requests.filter(f => f < this.state.currentFloor).sort((a, b) => b - a)[0];
      
      if (nextInDirection) {
        this.state.targetFloor = nextInDirection;
      } else {
        // Change direction if no requests in current direction
        const oppositeDirection = requests.filter(f => 
          this.state.direction === 'UP' 
            ? f < this.state.currentFloor 
            : f > this.state.currentFloor
        );
        
        if (oppositeDirection.length > 0) {
          this.state.direction = this.state.direction === 'UP' ? 'DOWN' : 'UP';
          this.state.targetFloor = this.state.direction === 'UP' 
            ? Math.min(...oppositeDirection)
            : Math.max(...oppositeDirection);
        } else {
          this.state.direction = 'STATIONARY';
          this.state.targetFloor = null;
        }
      }
    }

    // Start moving if we have a target
    if (this.state.targetFloor !== null && this.state.doorState === 'CLOSED') {
      this.startMoving();
    }
  }

  startMoving() {
    if (this.state.targetFloor === this.state.currentFloor) {
      this.arriveAtFloor();
      return;
    }

    this.state.inMotion = true;
    this.notifyListeners('directionChanged', this.state.direction);
    
    // Calculate travel time
    const floorsToTravel = Math.abs(this.state.targetFloor - this.state.currentFloor);
    const travelTime = floorsToTravel * this.config.floorTravelTime;
    
    // Update object dictionary
    this.objectDictionary[0x6000].value |= 0x4; // Set in-motion bit
    
    // Simulate movement
    this.movementTimer = setTimeout(() => {
      this.state.currentFloor = this.state.targetFloor;
      this.objectDictionary[0x6001].value = this.state.currentFloor;
      this.arriveAtFloor();
    }, travelTime);
  }

  arriveAtFloor() {
    this.state.inMotion = false;
    this.state.floorRequests.delete(this.state.currentFloor);
    this.objectDictionary[0x6000].value &= ~0x4; // Clear in-motion bit
    
    this.notifyListeners('floorChanged', this.state.currentFloor);
    
    // Open door on arrival
    this.openDoor();
    
    // Check for more requests after door cycle completes
    this.doorTimer = setTimeout(() => {
      this.closeDoor();
      setTimeout(() => this.updateTargetFloor(), 1000);
    }, this.config.doorOpenTime);
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