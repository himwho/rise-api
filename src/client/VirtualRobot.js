/**
 * VirtualRobot.js
 * 
 * Implementation of a virtual robot client that can interact with the elevator
 */

class VirtualRobot {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      name: 'VacuumBot',
      startFloor: 1,
      movementSpeed: 1, // meters per second
      ...config
    };

    // Robot state
    this.state = {
      currentFloor: this.config.startFloor,
      targetFloor: null,
      position: { x: 0, y: 0 }, // Position on current floor
      status: 'IDLE', // IDLE, WAITING_FOR_ELEVATOR, ENTERING_ELEVATOR, IN_ELEVATOR, EXITING_ELEVATOR, MOVING_TO_DESTINATION
      batteryLevel: 100,
      errorState: null,
    };

    this.elevatorConnection = null;
    this.elevatorState = null;
    this.taskQueue = [];
    this.currentTask = null;
  }

  // Connect to elevator system
  connectToElevator(elevatorSystem) {
    this.elevatorConnection = elevatorSystem;
    
    // Register for elevator events
    elevatorSystem.addEventListener('floorChanged', this.handleElevatorFloorChange.bind(this));
    elevatorSystem.addEventListener('doorStateChanged', this.handleElevatorDoorChange.bind(this));
    
    // Get initial elevator state
    this.elevatorState = elevatorSystem.getState();
    
    console.log(`Robot ${this.config.name} connected to elevator system`);
    return true;
  }

  // Disconnect from elevator
  disconnectFromElevator() {
    if (this.elevatorConnection) {
      this.elevatorConnection.removeEventListener('floorChanged', this.handleElevatorFloorChange.bind(this));
      this.elevatorConnection.removeEventListener('doorStateChanged', this.handleElevatorDoorChange.bind(this));
      this.elevatorConnection = null;
    }
  }

  // Event handlers
  handleElevatorFloorChange(floor) {
    this.elevatorState.currentFloor = floor;
    
    // If we're in the elevator and it reaches our target floor
    if (this.state.status === 'IN_ELEVATOR' && floor === this.state.targetFloor) {
      console.log(`Elevator arrived at target floor ${floor}, preparing to exit`);
    }
  }

  handleElevatorDoorChange(doorState) {
    this.elevatorState.doorState = doorState;
    
    // Handle different door states based on robot status
    if (this.state.status === 'WAITING_FOR_ELEVATOR' && doorState === 'OPEN' && 
        this.elevatorState.currentFloor === this.state.currentFloor) {
      this.enterElevator();
    } else if (this.state.status === 'IN_ELEVATOR' && doorState === 'OPEN' && 
               this.elevatorState.currentFloor === this.state.targetFloor) {
      this.exitElevator();
    }
  }

  // Robot actions
  goToFloor(floorNumber) {
    if (!this.elevatorConnection) {
      throw new Error('Not connected to elevator system');
    }
    
    if (floorNumber === this.state.currentFloor) {
      console.log(`Already at floor ${floorNumber}`);
      return Promise.resolve();
    }
    
    this.state.targetFloor = floorNumber;
    console.log(`Robot ${this.config.name} planning to go to floor ${floorNumber}`);
    
    return new Promise((resolve, reject) => {
      this.taskQueue.push({
        type: 'FLOOR_CHANGE',
        targetFloor: floorNumber,
        resolve,
        reject
      });
      
      if (!this.currentTask) {
        this.processNextTask();
      }
    });
  }

  processNextTask() {
    if (this.taskQueue.length === 0) {
      this.currentTask = null;
      return;
    }
    
    this.currentTask = this.taskQueue.shift();
    
    if (this.currentTask.type === 'FLOOR_CHANGE') {
      this.executeFloorChangeTask();
    }
  }

  executeFloorChangeTask() {
    const { targetFloor } = this.currentTask;
    
    // Move to elevator if not already there
    this.moveToElevator()
      .then(() => {
        // Call elevator to current floor
        this.state.status = 'WAITING_FOR_ELEVATOR';
        console.log(`Calling elevator to floor ${this.state.currentFloor}`);
        return this.callElevator();
      })
      .catch(err => {
        console.error('Error during floor change task:', err);
        this.state.status = 'IDLE';
        this.currentTask.reject(err);
        this.processNextTask();
      });
  }

  moveToElevator() {
    console.log(`Moving to elevator on floor ${this.state.currentFloor}`);
    
    // Simulate movement to elevator
    return new Promise(resolve => {
      setTimeout(() => {
        console.log(`Arrived at elevator on floor ${this.state.currentFloor}`);
        resolve();
      }, 2000); // Simulate 2 seconds of movement
    });
  }

  callElevator() {
    if (!this.elevatorConnection) {
      return Promise.reject(new Error('Not connected to elevator'));
    }
    
    // Request elevator to current floor, passing 'bot' as the requester type
    this.elevatorConnection.requestFloor(this.state.currentFloor, 'bot');
    
    // Wait for elevator to arrive with door open
    return new Promise((resolve, reject) => {
      const checkElevator = setInterval(() => {
        if (this.elevatorState.currentFloor === this.state.currentFloor && 
            this.elevatorState.doorState === 'OPEN') {
          clearInterval(checkElevator);
          resolve();
        }
      }, 500);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkElevator);
        reject(new Error('Timeout waiting for elevator'));
      }, 30000);
    });
  }

  enterElevator() {
    console.log(`Entering elevator at floor ${this.state.currentFloor}`);
    this.state.status = 'ENTERING_ELEVATOR';
    
    // Simulate time to enter elevator
    setTimeout(() => {
      this.state.status = 'IN_ELEVATOR';
      console.log('Inside elevator, requesting target floor');
      
      // Request target floor
      this.elevatorConnection.requestFloor(this.state.targetFloor);
    }, 3000);
  }

  exitElevator() {
    console.log(`Exiting elevator at floor ${this.state.targetFloor}`);
    this.state.status = 'EXITING_ELEVATOR';
    
    // Simulate time to exit elevator
    setTimeout(() => {
      this.state.currentFloor = this.state.targetFloor;
      this.state.status = 'MOVING_TO_DESTINATION';
      
      // Simulate moving to final destination on floor
      setTimeout(() => {
        this.state.status = 'IDLE';
        console.log(`Arrived at destination on floor ${this.state.currentFloor}`);
        
        if (this.currentTask) {
          this.currentTask.resolve();
          this.processNextTask();
        }
      }, 3000);
    }, 3000);
  }

  // Get current state
  getState() {
    return { ...this.state };
  }
}

module.exports = VirtualRobot; 