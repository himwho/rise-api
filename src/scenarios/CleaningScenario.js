/**
 * CleaningScenario.js
 * 
 * A scenario that simulates cleaning robots and building tenants using elevators
 */

class CleaningScenario {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      floors: 10,
      elevators: 1,
      bots: 1,
      tenantActivityLevel: 0.4, // 0-1, how busy the building is
      cleaningTimePerFloor: 10 * 60 * 1000, // 10 minutes in milliseconds (default)
      simulationDuration: 1 * 60 * 60 * 1000, // 1 hour in milliseconds
      useOffPeakHours: false,
      offPeakStartHour: 22,
      offPeakEndHour: 6,
      ...config
    };
    
    // If cleaningTimeMinutes was provided, override the default
    if (config.cleaningTimeMinutes) {
      this.config.cleaningTimePerFloor = config.cleaningTimeMinutes * 60 * 1000;
    }
    
    // Calculate hourly requests based on activity level (adjusted formula)
    // Scale from 1 request at level 0.1 to 100 requests at level 1.0
    this.hourlyRequests = Math.round(1 + (this.config.tenantActivityLevel * 99)); 
    
    this.name = `Cleaning Scenario (${this.config.floors} floors, ${this.config.elevators} elevators, ${this.config.bots} bots, ~${this.hourlyRequests} requests/hour)`;
    this.duration = this.config.simulationDuration;
    
    // Generate steps for the scenario
    this.steps = this.generateScenarioSteps();
    
    // Define completion handler
    this.onComplete = (simulator) => {
      console.log('\n=== Cleaning Scenario Completed ===');
      
      // Calculate statistics - ensure we're accessing the correct data
      const cleanedFloors = new Set();
      
      simulator.robots.forEach(robot => {
        if (robot.config.type === 'cleaner' && robot.visitedFloors) {
          console.log(`Robot ${robot.config.name} visited floors: ${Array.from(robot.visitedFloors).join(', ')}`);
          robot.visitedFloors.forEach(floor => cleanedFloors.add(floor));
        }
      });
      
      console.log(`\nCleaning Statistics:`);
      console.log(`Total floors in building: ${this.config.floors}`);
      console.log(`Floors cleaned: ${cleanedFloors.size}`);
      console.log(`Cleaning coverage: ${Math.round((cleanedFloors.size / this.config.floors) * 100)}%`);
      
      // Elevator usage statistics for all elevators
      console.log(`\nElevator Usage Statistics:`);
      
      simulator.elevators.forEach((elevator, i) => {
        const totalRequests = elevator.totalRequests || 0;
        const botRequests = elevator.botRequests || 0;
        const tenantRequests = elevator.tenantRequests || 0;
        
        console.log(`\nElevator ${i+1}:`);
        console.log(`  Total requests: ${totalRequests}`);
        console.log(`  Cleaning bot requests: ${botRequests} (${totalRequests > 0 ? Math.round((botRequests / totalRequests) * 100) : 0}%)`);
        console.log(`  Tenant requests: ${tenantRequests} (${totalRequests > 0 ? Math.round((tenantRequests / totalRequests) * 100) : 0}%)`);
      });
      
      // Final state
      console.log('\nFinal State:');
      console.log('Elevator positions:');
      simulator.elevators.forEach((elevator, i) => {
        const state = elevator.getState();
        console.log(`  Elevator ${i+1}: Floor ${state.currentFloor}`);
      });
      
      console.log('Robot positions:');
      simulator.robots.forEach((robot, i) => {
        const state = robot.getState();
        console.log(`  Robot ${i+1} (${robot.config.type}): Floor ${state.currentFloor}, Status: ${state.status}`);
      });
      
      // Force process to exit after a short delay
      setTimeout(() => {
        console.log("\n========== SIMULATION COMPLETE ==========");
        process.exit(0); // Force exit to prevent any lingering timeouts
      }, 100);
    };
  }
  
  generateScenarioSteps() {
    const steps = [];
    
    // Initialize cleaning bots with their cleaning schedule
    for (let i = 0; i < this.config.bots; i++) {
      // Assign each bot to an elevator (round-robin)
      const elevatorIndex = i % this.config.elevators;
      
      steps.push({
        time: 1000 + (i * 2000), // Stagger start times
        description: `Initialize cleaning bot ${i+1} schedule (using elevator ${elevatorIndex+1})`,
        action: (simulator) => {
          const robot = simulator.robots[i];
          
          // Set robot type to cleaner
          robot.config.type = 'cleaner';
          robot.config.elevatorIndex = elevatorIndex;
          
          // Initialize tracking of visited floors
          robot.visitedFloors = new Set();
          
          // Connect robot to its assigned elevator
          if (robot.elevatorConnection !== simulator.elevators[elevatorIndex]) {
            robot.disconnectFromElevator();
            robot.connectToElevator(simulator.elevators[elevatorIndex]);
          }
          
          // Start the cleaning cycle
          this.startCleaningCycle(robot, 1, simulator);
        }
      });
    }
    
    // Generate random tenant elevator usage
    const tenantSteps = this.generateTenantSteps();
    steps.push(...tenantSteps);
    
    // Add tracking for elevator requests
    steps.push({
      time: 500,
      description: 'Initialize elevator request tracking',
      action: (simulator) => {
        simulator.elevators.forEach(elevator => {
          elevator.totalRequests = 0;
          elevator.botRequests = 0;
          elevator.tenantRequests = 0;
          
          // Don't override the requestFloor method - it's already handling tracking
        });
      }
    });
    
    return steps;
  }
  
  startCleaningCycle(robot, startFloor, simulator) {
    // Get a reference to the elevator for statistics
    const elevatorIndex = robot.config.elevatorIndex || 0;
    const elevator = simulator.elevators[elevatorIndex];
    
    console.log(`Starting cleaning cycle for ${robot.config.name} using elevator ${elevatorIndex+1}`);
    
    // Initialize tracking if not already done
    if (!robot.visitedFloors) {
      robot.visitedFloors = new Set();
    }
    
    // Function to check if current time is within off-peak hours
    const isOffPeakHours = () => {
      if (!this.config.useOffPeakHours) {
        return true; // If off-peak mode is disabled, always return true
      }
      
      // Convert simulation time to hours (assuming simulation starts at midnight)
      const simulationHours = (simulator.time / 3600000) % 24;
      
      // Check if current hour is within off-peak range
      if (this.config.offPeakStartHour < this.config.offPeakEndHour) {
        // Simple case: off-peak is within the same day
        return simulationHours >= this.config.offPeakStartHour && simulationHours < this.config.offPeakEndHour;
      } else {
        // Complex case: off-peak spans midnight
        return simulationHours >= this.config.offPeakStartHour || simulationHours < this.config.offPeakEndHour;
      }
    };
    
    // Function to clean a floor then move to the next
    const cleanFloor = (floorNumber) => {
      // Check if we're in off-peak hours
      if (this.config.useOffPeakHours && !isOffPeakHours()) {
        console.log(`Cleaning bot ${robot.config.name} waiting for off-peak hours to clean floor ${floorNumber}`);
        
        // Check again in 15 minutes
        setTimeout(() => {
          if (simulator.running) {
            if (isOffPeakHours()) {
              console.log(`Off-peak hours started, resuming cleaning`);
              cleanFloor(floorNumber);
            } else {
              console.log(`Still not off-peak hours, continuing to wait`);
              // Check again later
              cleanFloor(floorNumber);
            }
          }
        }, 15 * 60 * 1000 / simulator.config.simulationSpeed);
        
        return;
      }
      
      // Update battery before starting to clean
      robot.updateBatteryLevel();
      
      // Check if we have enough battery to clean this floor
      if (!robot.canCompleteTask(this.config.cleaningTimePerFloor / 60000)) {
        console.log(`Robot ${robot.config.name} doesn't have enough battery to clean floor ${floorNumber}, returning to charging station`);
        robot.returnToChargingStation()
          .then(() => {
            // After charging, resume cleaning
            setTimeout(() => {
              if (simulator.running && robot.state.status === 'IDLE') {
                console.log(`Robot ${robot.config.name} resuming cleaning after charging`);
                cleanFloor(floorNumber);
              }
            }, 1000);
          });
        return;
      }
      
      // Set robot status to cleaning
      robot.state.status = 'CLEANING';
      console.log(`Cleaning bot ${robot.config.name} started cleaning floor ${floorNumber}`);
      
      // Mark this floor as visited - IMMEDIATELY when cleaning starts
      robot.visitedFloors.add(floorNumber);
      console.log(`Floor ${floorNumber} marked as cleaned. Total floors cleaned: ${robot.visitedFloors.size}`);
      
      // Simulate cleaning time
      setTimeout(() => {
        if (!simulator.running) return; // Exit if simulation stopped
        
        console.log(`Cleaning bot ${robot.config.name} finished cleaning floor ${floorNumber}`);
        
        // Ensure battery level is updated after cleaning
        robot.updateBatteryLevel();
        
        // Check if battery is too low to continue
        if (robot.state.batteryPercentage < 20) {
          console.log(`Cleaning bot ${robot.config.name} battery low (${robot.state.batteryPercentage}%), returning to charging station`);
          robot.returnToChargingStation();
          return;
        }
        
        // Move to next floor if simulation is still running
        if (simulator.running) {
          const nextFloor = this.getNextFloorToClean(robot);
          console.log(`Cleaning bot ${robot.config.name} planning to move to floor ${nextFloor}`);
          
          // Store the simulator reference in the robot for later use
          robot.simulator = simulator;
          
          // Explicitly set requesterType to 'bot'
          robot.goToFloor(nextFloor)
            .then(() => {
              console.log(`Cleaning bot ${robot.config.name} successfully moved to floor ${nextFloor}`);
              // Start cleaning the next floor
              cleanFloor(nextFloor);
            })
            .catch(err => {
              console.error(`Error moving cleaning bot to floor ${nextFloor}:`, err);
              
              // Just clean the current floor again
              console.log(`Cleaning bot ${robot.config.name} will clean the current floor again`);
              cleanFloor(floorNumber);
            });
        }
      }, this.config.cleaningTimePerFloor / simulator.config.simulationSpeed);
    };
    
    // Start the cleaning cycle at the specified floor
    console.log(`Cleaning bot ${robot.config.name} moving to starting floor ${startFloor}`);
    
    // Store the simulator reference in the robot for later use
    robot.simulator = simulator;
    
    // If the robot can't move to the starting floor, just start cleaning the current floor
    robot.goToFloor(startFloor)
      .then(() => {
        cleanFloor(startFloor);
      })
      .catch(err => {
        console.error(`Error moving cleaning bot to starting floor:`, err);
        console.log(`Starting to clean current floor ${robot.state.currentFloor} instead`);
        cleanFloor(robot.state.currentFloor);
      });
  }
  
  getNextFloorToClean(robot) {
    // Simple strategy: go to the next floor, or back to floor 1 if at the top
    const currentFloor = robot.state.currentFloor;
    
    if (currentFloor >= this.config.floors) {
      return 1; // Go back to the first floor
    } else {
      return currentFloor + 1; // Go to the next floor up
    }
  }
  
  generateTenantSteps() {
    const steps = [];
    const simulationDuration = this.config.simulationDuration;
    const simulationHours = simulationDuration / (60 * 60 * 1000);
    
    // Calculate total requests for the simulation
    const totalRequests = Math.round(this.hourlyRequests * simulationHours);
    
    console.log(`Generating ${totalRequests} tenant requests over ${simulationHours} hours`);
    
    // Generate random elevator requests throughout the simulation
    for (let i = 0; i < totalRequests; i++) {
      // Random time for this request (ensure they're spread throughout the simulation)
      const requestTime = Math.floor(Math.random() * simulationDuration);
      
      // Random starting floor
      let startFloor, destinationFloor;
      
      // 70% of traffic should be to/from lobby (floor 1)
      if (Math.random() < 0.7) {
        if (Math.random() < 0.5) {
          // Going from lobby to upper floor
          startFloor = 1;
          destinationFloor = Math.floor(Math.random() * (this.config.floors - 1)) + 2; // Floor 2 to top
        } else {
          // Going from upper floor to lobby
          startFloor = Math.floor(Math.random() * (this.config.floors - 1)) + 2; // Floor 2 to top
          destinationFloor = 1;
        }
      } else {
        // Random floor to random floor (not the same)
        startFloor = Math.floor(Math.random() * this.config.floors) + 1;
        do {
          destinationFloor = Math.floor(Math.random() * this.config.floors) + 1;
        } while (destinationFloor === startFloor);
      }
      
      // Create a unique ID for this tenant
      const tenantId = `tenant-${i}`;
      
      // Add step for this elevator request
      steps.push({
        time: requestTime,
        description: `Building occupant ${tenantId} requests elevator from floor ${startFloor} to floor ${destinationFloor}`,
        action: (simulator) => {
          // Choose a random elevator
          const elevatorIndex = Math.floor(Math.random() * this.config.elevators);
          const elevator = simulator.elevators[elevatorIndex];
          
          // Create a virtual tenant
          const VirtualTenant = require('../client/VirtualTenant');
          const tenant = new VirtualTenant({
            id: tenantId,
            startFloor: startFloor,
            destinationFloor: destinationFloor,
            patience: 180000 / simulator.config.simulationSpeed // Scale patience with simulation speed
          });
          
          // Connect tenant to elevator
          console.log(`Building occupant ${tenantId} calling elevator ${elevatorIndex+1} from floor ${startFloor} to go to floor ${destinationFloor}`);
          tenant.connectToElevator(elevator);
          
          // Store tenant in simulator for tracking
          if (!simulator.tenants) {
            simulator.tenants = [];
          }
          simulator.tenants.push(tenant);
        }
      });
    }
    
    // Sort steps by time
    steps.sort((a, b) => a.time - b.time);
    
    return steps;
  }
}

module.exports = CleaningScenario; 