/**
 * VirtualRobot.js
 * 
 * Implementation of a virtual robot client that can interact with the elevator
 */

class VirtualRobot {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      name: 'Bot',
      startFloor: 1,
      movementSpeed: 1, // meters per second
      batteryCapacity: 5000, // mAh
      batteryConsumptionRate: 10, // mAh per minute of operation
      chargingRate: 100, // mAh per minute of charging
      chargingFloor: 1, // Floor where the charging station is located
      cleaningTimePerFloor: 10 * 60 * 1000, // 10 minutes per floor by default
      ...config
    };

    // Robot state
    this.state = {
      currentFloor: this.config.startFloor,
      targetFloor: null,
      position: { x: 0, y: 0 }, // Position on current floor
      status: 'IDLE', // IDLE, WAITING_FOR_ELEVATOR, ENTERING_ELEVATOR, IN_ELEVATOR, EXITING_ELEVATOR, MOVING_TO_DESTINATION, CHARGING, CLEANING
      batteryLevel: this.config.batteryCapacity, // Start with full battery
      batteryPercentage: 100,
      errorState: null,
      lastBatteryUpdateTime: Date.now(),
    };

    this.elevatorConnection = null;
    this.elevatorState = null;
    this.taskQueue = [];
    this.currentTask = null;

    // Start battery monitoring
    this.startBatteryMonitoring();
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
    if (!this.elevatorConnection) {
      return; // Already disconnected
    }
    
    console.log(`Robot ${this.config.name} disconnecting from elevator`);
    this.elevatorConnection = null;
    this.elevatorState = null;
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
    if (floorNumber < 1) {
      return Promise.reject(new Error(`Invalid floor number: ${floorNumber}`));
    }
    
    // If already at the requested floor, resolve immediately
    if (this.state.currentFloor === floorNumber && this.state.status === 'IDLE') {
      console.log(`Already at floor ${floorNumber}`);
      return Promise.resolve();
    }
    
    // If already going to this floor, return the existing promise
    if (this.state.targetFloor === floorNumber) {
      console.log(`Already going to floor ${floorNumber}`);
      return this.currentFloorPromise;
    }
    
    // Update state
    this.state.targetFloor = floorNumber;
    this.state.status = 'WAITING_FOR_ELEVATOR';
    
    console.log(`Robot ${this.config.name} requesting elevator to go to floor ${floorNumber}`);
    
    // Create a promise that will resolve when we reach the target floor
    this.currentFloorPromise = new Promise((resolve, reject) => {
      // Store the resolve/reject functions
      this.resolveFloorPromise = resolve;
      this.rejectFloorPromise = reject;
      
      // Set a timeout to reject the promise if it takes too long
      this.floorPromiseTimeout = setTimeout(() => {
        if (this.state.currentFloor !== floorNumber) {
          console.error(`Timeout waiting for elevator to floor ${floorNumber}`);
          this.state.status = 'IDLE';
          this.state.targetFloor = null;
          reject(new Error(`Timeout waiting for elevator to floor ${floorNumber}`));
        }
      }, 60000); // 1 minute timeout
      
      // Request the elevator with 'bot' type for statistics
      if (this.elevatorConnection) {
        this.elevatorConnection.requestFloor(this.state.currentFloor, 'bot');
      } else {
        reject(new Error('No elevator connection'));
      }
    });
    
    return this.currentFloorPromise;
  }

  processNextTask() {
    if (this.taskQueue.length === 0 || this.currentTask) {
      return;
    }
    
    this.currentTask = this.taskQueue.shift();
    
    try {
      if (this.currentTask.type === 'FLOOR_CHANGE') {
        this.changeFloor(this.currentTask.targetFloor)
          .then(() => {
            if (this.currentTask) {
              this.currentTask.resolve();
              this.currentTask = null;
              this.processNextTask();
            }
          })
          .catch(err => {
            console.error('Error during floor change task:', err);
            if (this.currentTask) {
              this.currentTask.reject(err);
              this.currentTask = null;
              this.processNextTask(); // Continue with next task even after error
            }
          });
      }
    } catch (error) {
      console.error('Error processing task:', error);
      if (this.currentTask) {
        this.currentTask.reject(error);
        this.currentTask = null;
        this.processNextTask();
      }
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
    
    console.log(`Robot ${this.config.name} explicitly requesting elevator as 'bot' type`);
    // Request elevator to current floor, explicitly passing 'bot' as the requester type
    this.elevatorConnection.requestFloor(this.state.currentFloor, 'bot');
    
    // Request repeatedly every few seconds to ensure it gets attention
    const requestInterval = setInterval(() => {
      if (this.state.status === 'WAITING_FOR_ELEVATOR') {
        console.log(`Robot ${this.config.name} re-requesting elevator as 'bot' type`);
        this.elevatorConnection.requestFloor(this.state.currentFloor, 'bot');
      } else {
        clearInterval(requestInterval);
      }
    }, 5000);
    
    // Wait for elevator to arrive with door open
    return new Promise((resolve, reject) => {
      let checkInterval = null;
      let timeoutId = null;
      
      const cleanup = () => {
        if (checkInterval) clearInterval(checkInterval);
        if (timeoutId) clearTimeout(timeoutId);
      };
      
      checkInterval = setInterval(() => {
        if (this.elevatorState.currentFloor === this.state.currentFloor && 
            this.elevatorState.doorState === 'OPEN') {
          cleanup();
          resolve();
        }
      }, 500);
      
      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        cleanup();
        console.log(`Robot ${this.config.name} timed out waiting for elevator at floor ${this.state.currentFloor}`);
        
        // Try again instead of failing
        console.log(`Robot ${this.config.name} is trying again to call elevator`);
        this.elevatorConnection.requestFloor(this.state.currentFloor, 'bot');
        
        // Give it another 30 seconds
        setTimeout(() => {
          if (this.elevatorState.currentFloor === this.state.currentFloor && 
              this.elevatorState.doorState === 'OPEN') {
            resolve();
          } else {
            console.log(`Robot ${this.config.name} failed to get elevator after retry, initiating recovery`);
            this.recoverFromTimeout();
            reject(new Error('Timeout waiting for elevator after retry'));
          }
        }, 30000);
      }, 30000);
    });
  }

  enterElevator() {
    if (this.state.status !== 'WAITING_FOR_ELEVATOR') {
      return;
    }
    
    console.log(`Robot ${this.config.name} entering elevator at floor ${this.state.currentFloor}`);
    
    // Update state
    this.state.status = 'ENTERING_ELEVATOR';
    
    // Simulate time to enter elevator
    setTimeout(() => {
      this.state.status = 'IN_ELEVATOR';
      
      // Request target floor
      console.log(`Robot ${this.config.name} requesting elevator to go to floor ${this.state.targetFloor}`);
      this.elevatorConnection.requestFloor(this.state.targetFloor, 'bot', this.config.name);
    }, 2000);
  }

  exitElevator() {
    if (this.state.status !== 'IN_ELEVATOR') {
      return;
    }
    
    console.log(`Robot ${this.config.name} exiting elevator at floor ${this.state.targetFloor}`);
    
    // Update state
    this.state.status = 'EXITING_ELEVATOR';
    
    // Simulate time to exit elevator
    setTimeout(() => {
      // Update current floor
      this.state.currentFloor = this.state.targetFloor;
      
      // If we were going to a floor to clean, start cleaning
      if (this.visitedFloors && !this.visitedFloors.has(this.state.currentFloor) && this.state.currentFloor !== this.config.chargingFloor) {
        console.log(`Robot ${this.config.name} will start cleaning floor ${this.state.currentFloor}`);
        this.cleanCurrentFloor();
      } else if (this.state.currentFloor === this.config.chargingFloor && this.state.batteryPercentage < 95) {
        // If at charging floor and battery is not full, start charging
        console.log(`Robot ${this.config.name} at charging floor, starting to charge`);
        this.startCharging();
      } else {
        // Otherwise, go to idle state
        this.state.status = 'IDLE';
        console.log(`Robot ${this.config.name} is now idle at floor ${this.state.currentFloor}`);
        
        // If we have more floors to clean, move to the next one
        if (this.visitedFloors && this.visitedFloors.size < this.elevatorConnection.config.floors) {
          console.log(`Robot ${this.config.name} has more floors to clean, moving to next floor`);
          this.moveToNextFloor();
        }
      }
    }, 2000);
  }

  // Get current state
  getState() {
    return { ...this.state };
  }

  // Update the changeFloor method to properly handle the elevator request
  changeFloor(targetFloor) {
    if (targetFloor === this.state.currentFloor) {
      return Promise.resolve();
    }
    
    console.log(`Robot ${this.config.name} changing floor from ${this.state.currentFloor} to ${targetFloor}`);
    
    return new Promise((resolve, reject) => {
      // Move to elevator if not already there
      this.moveToElevator()
        .then(() => {
          // Call elevator to current floor
          this.state.status = 'WAITING_FOR_ELEVATOR';
          console.log(`Robot ${this.config.name} calling elevator to floor ${this.state.currentFloor}`);
          return this.callElevator();
        })
        .then(() => {
          // Enter elevator
          console.log(`Robot ${this.config.name} entering elevator`);
          return this.enterElevatorAndGoToFloor(targetFloor);
        })
        .then(() => {
          console.log(`Robot ${this.config.name} successfully changed floor to ${targetFloor}`);
          resolve();
        })
        .catch(err => {
          console.error(`Robot ${this.config.name} failed to change floor:`, err);
          reject(err);
        });
    });
  }

  // Add a new method to handle entering elevator and going to floor
  enterElevatorAndGoToFloor(targetFloor) {
    return new Promise((resolve, reject) => {
      // Enter elevator
      console.log(`Robot ${this.config.name} entering elevator at floor ${this.state.currentFloor}`);
      this.state.status = 'ENTERING_ELEVATOR';
      
      // Simulate time to enter elevator
      setTimeout(() => {
        this.state.status = 'IN_ELEVATOR';
        console.log(`Robot ${this.config.name} inside elevator, requesting target floor ${targetFloor}`);
        
        // Request target floor with 'bot' type
        this.elevatorConnection.requestFloor(targetFloor, 'bot');
        
        // Wait for elevator to arrive at target floor with door open
        const checkArrival = setInterval(() => {
          if (this.elevatorState.currentFloor === targetFloor && 
              this.elevatorState.doorState === 'OPEN') {
            clearInterval(checkArrival);
            clearTimeout(arrivalTimeout);
            
            // Exit elevator
            this.exitElevatorAtFloor(targetFloor, resolve);
          }
        }, 500);
        
        // Timeout for arrival
        const arrivalTimeout = setTimeout(() => {
          clearInterval(checkArrival);
          reject(new Error(`Timeout waiting for elevator to arrive at floor ${targetFloor}`));
        }, 60000); // 1 minute timeout
      }, 3000);
    });
  }

  // Add a method to handle exiting the elevator
  exitElevatorAtFloor(floor, callback) {
    console.log(`Robot ${this.config.name} exiting elevator at floor ${floor}`);
    this.state.status = 'EXITING_ELEVATOR';
    
    // Simulate time to exit elevator
    setTimeout(() => {
      this.state.currentFloor = floor;
      this.state.status = 'MOVING_TO_DESTINATION';
      
      // Simulate moving to final destination on floor
      setTimeout(() => {
        this.state.status = 'IDLE';
        console.log(`Robot ${this.config.name} arrived at destination on floor ${floor}`);
        
        if (callback) callback();
      }, 3000);
    }, 3000);
  }

  // Add a method to recover from timeouts
  recoverFromTimeout() {
    console.log(`Robot ${this.config.name} attempting to recover from timeout`);
    
    // Reset status
    this.state.status = 'IDLE';
    
    // Clear current task
    if (this.currentTask) {
      this.currentTask.reject(new Error('Task aborted during recovery'));
      this.currentTask = null;
    }
    
    // Wait a bit before continuing
    setTimeout(() => {
      console.log(`Robot ${this.config.name} recovered and continuing with next task`);
      this.processNextTask();
    }, 5000);
  }

  // Update the updateBatteryLevel method to ensure it's called regularly
  updateBatteryLevel() {
    const now = Date.now();
    const elapsedMinutes = (now - this.state.lastBatteryUpdateTime) / 60000;
    
    if (elapsedMinutes > 0) {
      // Only consume battery if the robot is active (not IDLE or CHARGING)
      if (this.state.status !== 'IDLE' && this.state.status !== 'CHARGING') {
        // Calculate battery consumption
        const batteryConsumed = elapsedMinutes * this.config.batteryConsumptionRate;
        this.state.batteryLevel -= batteryConsumed;
        
        // Ensure battery doesn't go below 0
        if (this.state.batteryLevel < 0) {
          this.state.batteryLevel = 0;
        }
        
        // Update battery percentage
        this.state.batteryPercentage = Math.round((this.state.batteryLevel / this.config.batteryCapacity) * 100);
        
        // Log battery level every 5% change
        if (Math.floor(this.state.batteryPercentage / 5) !== Math.floor((this.state.batteryPercentage + batteryConsumed) / 5)) {
          console.log(`Robot ${this.config.name} battery at ${this.state.batteryPercentage}%`);
        }
        
        // Check if battery is critically low
        if (this.state.batteryPercentage < 10 && this.state.status !== 'RETURNING_TO_CHARGER') {
          console.log(`Robot ${this.config.name} battery critically low (${this.state.batteryPercentage}%), returning to charging station`);
          this.returnToChargingStation();
        }
      } else if (this.state.status === 'CHARGING') {
        // Charging - increase battery level
        const chargeAmount = elapsedMinutes * this.config.chargingRate;
        this.state.batteryLevel = Math.min(this.config.batteryCapacity, this.state.batteryLevel + chargeAmount);
        
        // Update battery percentage
        this.state.batteryPercentage = Math.round((this.state.batteryLevel / this.config.batteryCapacity) * 100);
        
        // Log charging progress
        if (Math.floor(this.state.batteryPercentage / 10) !== Math.floor((this.state.batteryPercentage - chargeAmount) / 10)) {
          console.log(`Robot ${this.config.name} charging: ${this.state.batteryPercentage}%`);
        }
        
        // If fully charged, go back to cleaning if there are still floors to clean
        if (this.state.batteryPercentage >= 95 && this.visitedFloors && this.visitedFloors.size < this.elevatorConnection.config.floors) {
          console.log(`Robot ${this.config.name} fully charged, resuming cleaning`);
          this.state.status = 'IDLE';
          this.moveToNextFloor();
        }
      }
      
      // Update last battery update time
      this.state.lastBatteryUpdateTime = now;
    }
  }

  // Add a method to start regular battery updates
  startBatteryMonitoring() {
    // Clear any existing interval
    if (this.batteryMonitorInterval) {
      clearInterval(this.batteryMonitorInterval);
    }
    
    // Update battery level every 10 seconds
    this.batteryMonitorInterval = setInterval(() => {
      this.updateBatteryLevel();
    }, 10000);
    
    console.log(`Robot ${this.config.name} battery monitoring started`);
  }

  // Update the returnToChargingStation method to properly handle charging
  returnToChargingStation() {
    console.log(`Robot ${this.config.name} returning to charging station on floor ${this.config.chargingFloor}`);
    
    // Update status
    this.state.status = 'RETURNING_TO_CHARGER';
    this.state.targetFloor = this.config.chargingFloor;
    
    // If already at charging floor, start charging
    if (this.state.currentFloor === this.config.chargingFloor) {
      this.startCharging();
      return;
    }
    
    // Request elevator to go to charging floor
    this.requestElevator(this.config.chargingFloor);
  }

  // Fix the startCharging method to properly handle charging completion
  startCharging() {
    console.log(`Robot ${this.config.name} started charging at floor ${this.config.chargingFloor}`);
    
    // Update status
    this.state.status = 'CHARGING';
    
    // Update battery level immediately
    this.updateBatteryLevel();
    
    // Check battery level periodically
    this.chargingInterval = setInterval(() => {
      // Update battery level
      this.updateBatteryLevel();
      
      // If fully charged, resume cleaning
      if (this.state.batteryPercentage >= 95) {
        console.log(`Robot ${this.config.name} fully charged (${this.state.batteryPercentage}%), resuming cleaning`);
        
        // Clear charging interval
        clearInterval(this.chargingInterval);
        
        // If we have more floors to clean, move to the next one
        if (this.visitedFloors && this.visitedFloors.size < this.elevatorConnection.config.floors) {
          console.log(`Robot ${this.config.name} has more floors to clean, moving to next floor`);
          this.state.status = 'IDLE';
          this.moveToNextFloor();
        } else {
          console.log(`Robot ${this.config.name} has cleaned all floors, staying at charging station`);
          this.state.status = 'IDLE';
        }
      }
    }, 10000); // Check every 10 seconds
  }

  // Add a method to check if the robot can complete a task with current battery
  canCompleteTask(estimatedMinutes) {
    // Update battery level first
    this.updateBatteryLevel();
    
    // Calculate battery needed for the task
    const batteryNeeded = estimatedMinutes * this.config.batteryConsumptionRate;
    
    // Add battery needed to return to charging station
    const floorsToChargingStation = Math.abs(this.state.currentFloor - this.config.chargingFloor);
    const returnBatteryNeeded = (floorsToChargingStation * 2) * this.config.batteryConsumptionRate;
    
    // Total battery needed
    const totalBatteryNeeded = batteryNeeded + returnBatteryNeeded;
    
    console.log(`Battery check: Level ${this.state.batteryLevel}mAh, Need ${totalBatteryNeeded}mAh for ${estimatedMinutes} minutes of cleaning`);
    
    // Check if we have enough battery
    return this.state.batteryLevel >= totalBatteryNeeded;
  }

  // Fix the startCleaning method to properly initialize cleaning
  startCleaning() {
    if (this.state.status !== 'IDLE' && this.state.status !== 'CHARGING') {
      console.log(`Robot ${this.config.name} is already busy with status ${this.state.status}`);
      return false;
    }
    
    console.log(`Robot ${this.config.name} starting cleaning operation`);
    
    // Initialize visited floors set if not already done
    if (!this.visitedFloors) {
      this.visitedFloors = new Set();
    }
    
    // Ensure battery monitoring is active
    this.startBatteryMonitoring();
    
    // Start with the current floor
    this.cleanCurrentFloor();
    
    return true;
  }

  // Fix the cleanCurrentFloor method to properly handle completion
  cleanCurrentFloor() {
    const currentFloor = this.state.currentFloor;
    
    // Update status to cleaning
    this.state.status = 'CLEANING';
    console.log(`Robot ${this.config.name} cleaning floor ${currentFloor} (status: ${this.state.status})`);
    
    // Mark this floor as visited
    if (!this.visitedFloors) {
      this.visitedFloors = new Set();
    }
    this.visitedFloors.add(currentFloor);
    
    // Update battery level
    this.updateBatteryLevel();
    
    // Set a timer for the cleaning duration
    setTimeout(() => {
      console.log(`Robot ${this.config.name} finished cleaning floor ${currentFloor}`);
      
      // Update battery level again after cleaning
      this.updateBatteryLevel();
      
      // Check if battery is too low to continue
      if (this.state.batteryPercentage < 20) {
        console.log(`Robot ${this.config.name} battery low (${this.state.batteryPercentage}%), returning to charging station`);
        this.returnToChargingStation();
        return;
      }
      
      // Move to next floor
      this.moveToNextFloor();
    }, this.config.cleaningTimePerFloor || 60000); // Default to 1 minute if not specified
  }

  // Fix the moveToNextFloor method to properly handle floor transitions
  moveToNextFloor() {
    // Find a floor that hasn't been cleaned yet
    const uncleanedFloors = [];
    for (let i = 1; i <= this.elevatorConnection.config.floors; i++) {
      if (!this.visitedFloors.has(i)) {
        uncleanedFloors.push(i);
      }
    }
    
    // If all floors have been cleaned, return to charging station
    if (uncleanedFloors.length === 0) {
      console.log(`Robot ${this.config.name} has cleaned all floors, returning to charging station`);
      this.returnToChargingStation();
      return;
    }
    
    // Choose the next floor (closest one that hasn't been cleaned)
    let nextFloor = uncleanedFloors[0];
    let minDistance = Math.abs(nextFloor - this.state.currentFloor);
    
    for (const floor of uncleanedFloors) {
      const distance = Math.abs(floor - this.state.currentFloor);
      if (distance < minDistance) {
        minDistance = distance;
        nextFloor = floor;
      }
    }
    
    console.log(`Robot ${this.config.name} moving to next floor: ${nextFloor}`);
    
    // Update status
    this.state.status = 'WAITING_FOR_ELEVATOR';
    this.state.targetFloor = nextFloor;
    
    // Request elevator
    this.requestElevator(nextFloor);
  }

  // Fix the requestElevator method to properly handle elevator requests
  requestElevator(targetFloor) {
    if (!this.elevatorConnection) {
      console.error('No elevator connection');
      return;
    }
    
    console.log(`Robot ${this.config.name} requesting elevator to floor ${targetFloor}`);
    
    // Update state
    this.state.status = 'WAITING_FOR_ELEVATOR';
    this.state.targetFloor = targetFloor;
    
    // Request elevator to current floor
    this.elevatorConnection.requestFloor(this.state.currentFloor, 'bot', this.config.name);
    
    // Set up listeners if not already set up
    if (!this.doorStateListener) {
      this.doorStateListener = (doorState) => {
        if (doorState === 'OPEN' && 
            this.elevatorConnection.state.currentFloor === this.state.currentFloor && 
            this.state.status === 'WAITING_FOR_ELEVATOR') {
          // Enter elevator
          this.enterElevator();
        } else if (doorState === 'OPEN' && 
                   this.elevatorConnection.state.currentFloor === this.state.targetFloor && 
                   this.state.status === 'IN_ELEVATOR') {
          // Exit elevator
          this.exitElevator();
        }
      };
      
      this.elevatorConnection.addEventListener('doorStateChanged', this.doorStateListener);
    }
  }

  // Add a debug method to log robot state
  debugState() {
    console.log(`\n=== Robot ${this.config.name} Debug State ===`);
    console.log(`Current Floor: ${this.state.currentFloor}`);
    console.log(`Target Floor: ${this.state.targetFloor}`);
    console.log(`Status: ${this.state.status}`);
    console.log(`Battery Level: ${this.state.batteryLevel} mAh (${this.state.batteryPercentage}%)`);
    console.log(`Last Battery Update: ${new Date(this.state.lastBatteryUpdateTime).toISOString()}`);
    console.log(`Visited Floors: ${this.visitedFloors ? Array.from(this.visitedFloors).join(', ') : 'None'}`);
    console.log(`Connected to Elevator: ${this.elevatorConnection ? this.elevatorConnection.config.id : 'None'}`);
    console.log('===================================\n');
  }
}

module.exports = VirtualRobot; 