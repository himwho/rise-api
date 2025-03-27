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
      cleaningBots: 2,
      tenants: 5,
      cleaningTimePerFloor: 2 * 60 * 1000, // 2 minutes in milliseconds (for faster simulation)
      simulationDuration: 1 * 60 * 60 * 1000, // 1 hour in milliseconds
      tenantActivityLevel: 0.3, // 0-1, how often tenants use the elevator
      ...config
    };
    
    this.name = `Cleaning Scenario (${this.config.floors} floors, ${this.config.elevators} elevators, ${this.config.cleaningBots} bots, ${this.config.tenants} tenants)`;
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
    for (let i = 0; i < this.config.cleaningBots; i++) {
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
    
    // Function to clean a floor then move to the next
    const cleanFloor = (floorNumber) => {
      console.log(`Cleaning bot ${robot.config.name} starting to clean floor ${floorNumber}`);
      
      // Ensure visitedFloors is initialized
      if (!robot.visitedFloors) {
        robot.visitedFloors = new Set();
      }
      
      // Mark this floor as visited - IMMEDIATELY when cleaning starts
      robot.visitedFloors.add(floorNumber);
      console.log(`Floor ${floorNumber} marked as cleaned. Total floors cleaned: ${robot.visitedFloors.size}`);
      
      // Simulate cleaning time
      setTimeout(() => {
        console.log(`Cleaning bot ${robot.config.name} finished cleaning floor ${floorNumber}`);
        
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
              
              // Wait a bit and try again with a different floor
              setTimeout(() => {
                if (simulator.running) {
                  const alternateFloor = (nextFloor % this.config.floors) + 1;
                  console.log(`Cleaning bot ${robot.config.name} trying alternate floor ${alternateFloor}`);
                  
                  robot.goToFloor(alternateFloor)
                    .then(() => {
                      cleanFloor(alternateFloor);
                    })
                    .catch(secondErr => {
                      console.error(`Error moving to alternate floor:`, secondErr);
                      // Just stay on current floor and continue cleaning cycle
                      cleanFloor(floorNumber);
                    });
                }
              }, 10000 / simulator.config.simulationSpeed);
            });
        }
      }, this.config.cleaningTimePerFloor / simulator.config.simulationSpeed);
    };
    
    // Start the cleaning cycle at the specified floor
    console.log(`Cleaning bot ${robot.config.name} moving to starting floor ${startFloor}`);
    
    // Store the simulator reference in the robot for later use
    robot.simulator = simulator;
    
    // If the robot can't move to the starting floor after multiple attempts,
    // just start cleaning the current floor
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
    const tenantCount = this.config.tenants;
    const elevatorCount = this.config.elevators;
    
    // Create initial tenant positions (most start on floor 1)
    const tenantPositions = [];
    for (let i = 0; i < tenantCount; i++) {
      // 70% of tenants start on floor 1, 30% on random floors
      const startFloor = Math.random() < 0.7 ? 1 : Math.floor(Math.random() * this.config.floors) + 1;
      tenantPositions.push(startFloor);
    }
    
    // Generate random elevator usage throughout the day
    const activityLevel = this.config.tenantActivityLevel;
    const simulationDuration = this.config.simulationDuration;
    
    // Each tenant makes several elevator trips during the simulation
    for (let i = 0; i < tenantCount; i++) {
      // Number of trips depends on activity level (3-15 trips)
      const trips = Math.floor(3 + (activityLevel * 12));
      
      for (let trip = 0; trip < trips; trip++) {
        // Random time for this trip
        const tripTime = Math.floor(Math.random() * simulationDuration);
        
        // Determine destination floor (not current floor)
        const currentFloor = tenantPositions[i];
        let destinationFloor;
        
        do {
          destinationFloor = Math.floor(Math.random() * this.config.floors) + 1;
        } while (destinationFloor === currentFloor);
        
        // Update tenant position for next trip
        tenantPositions[i] = destinationFloor;
        
        // Add step for this tenant trip
        steps.push({
          time: tripTime,
          description: `Tenant ${i+1} requests elevator to floor ${destinationFloor}`,
          action: (simulator) => {
            // Choose a random elevator
            const elevatorIndex = Math.floor(Math.random() * elevatorCount);
            const elevator = simulator.elevators[elevatorIndex];
            
            // Create a virtual tenant request
            console.log(`Tenant ${i+1} calling elevator ${elevatorIndex+1} to go to floor ${destinationFloor}`);
            
            // Request elevator with 'tenant' type for statistics
            elevator.requestFloor(currentFloor, 'tenant');
            
            // Simulate tenant entering elevator and requesting destination
            setTimeout(() => {
              if (elevator.state.currentFloor === currentFloor && 
                  elevator.state.doorState === 'OPEN') {
                console.log(`Tenant ${i+1} entered elevator ${elevatorIndex+1} and requested floor ${destinationFloor}`);
                elevator.requestFloor(destinationFloor, 'tenant');
              } else {
                console.log(`Tenant ${i+1} missed elevator ${elevatorIndex+1} or got impatient`);
              }
            }, 5000 / simulator.config.simulationSpeed);
          }
        });
      }
    }
    
    // Sort steps by time
    steps.sort((a, b) => a.time - b.time);
    
    return steps;
  }
}

module.exports = CleaningScenario; 