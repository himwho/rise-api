/**
 * VirtualTenant.js
 * 
 * Implementation of a virtual tenant that can interact with the elevator
 */

class VirtualTenant {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      id: `tenant-${Date.now()}`,
      startFloor: 1,
      destinationFloor: null,
      patience: 180000, // 3 minutes in milliseconds
      ...config
    };

    // Tenant state
    this.state = {
      currentFloor: this.config.startFloor,
      status: 'WAITING', // WAITING, IN_ELEVATOR, EXITED
      requestTime: Date.now(),
      elevatorId: null
    };

    this.elevatorConnection = null;
    this.doorStateListener = null;
  }

  // Connect to elevator system
  connectToElevator(elevatorSystem) {
    this.elevatorConnection = elevatorSystem;
    this.state.elevatorId = elevatorSystem.config.id;
    
    // Request the elevator
    console.log(`Tenant ${this.config.id} requesting elevator to floor ${this.config.startFloor}`);
    elevatorSystem.requestFloor(this.config.startFloor, 'tenant', this.config.id, this.config.destinationFloor);
    
    // Set up listener for elevator arrival
    this.doorStateListener = (doorState) => {
      if (doorState === 'OPEN' && 
          elevatorSystem.state.currentFloor === this.config.startFloor && 
          this.state.status === 'WAITING') {
        // Enter the elevator
        this.enterElevator(elevatorSystem);
      } else if (doorState === 'OPEN' && 
                 elevatorSystem.state.currentFloor === this.config.destinationFloor && 
                 this.state.status === 'IN_ELEVATOR') {
        // Exit the elevator
        this.exitElevator(elevatorSystem);
      }
    };
    
    elevatorSystem.addEventListener('doorStateChanged', this.doorStateListener);
    
    // Set timeout for patience
    setTimeout(() => {
      if (this.state.status === 'WAITING') {
        console.log(`Tenant ${this.config.id} got impatient and left`);
        this.disconnect();
      }
    }, this.config.patience);
    
    return true;
  }

  // Enter the elevator
  enterElevator(elevator) {
    if (this.state.status !== 'WAITING') return;
    
    // Check if elevator is full
    if (elevator.state.occupants.length >= elevator.config.maxOccupants) {
      console.log(`Tenant ${this.config.id} couldn't enter elevator ${elevator.config.id} because it's full`);
      return;
    }
    
    console.log(`Tenant ${this.config.id} entering elevator at floor ${this.config.startFloor}`);
    
    // Update state
    this.state.status = 'IN_ELEVATOR';
    
    // Add tenant to elevator occupants
    elevator.addOccupant(this.config.id, 'tenant', this.config.destinationFloor);
    
    // Request destination floor
    console.log(`Tenant ${this.config.id} requesting destination floor ${this.config.destinationFloor}`);
    elevator.requestFloor(this.config.destinationFloor, 'tenant', this.config.id);
  }

  // Exit the elevator
  exitElevator(elevator) {
    if (this.state.status !== 'IN_ELEVATOR') return;
    
    console.log(`Tenant ${this.config.id} exiting elevator at floor ${this.config.destinationFloor}`);
    
    // Update state
    this.state.status = 'EXITED';
    this.state.currentFloor = this.config.destinationFloor;
    
    // Disconnect from elevator
    this.disconnect();
  }

  // Disconnect from elevator
  disconnect() {
    if (!this.elevatorConnection) return;
    
    // Remove event listener
    if (this.doorStateListener) {
      this.elevatorConnection.removeEventListener('doorStateChanged', this.doorStateListener);
      this.doorStateListener = null;
    }
    
    this.elevatorConnection = null;
  }

  // Get current state
  getState() {
    return { ...this.state };
  }
}

module.exports = VirtualTenant; 