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
      cleaningBots: 2,
      tenants: 5,
      cleaningTimePerFloor: 20 * 60 * 1000, // 20 minutes in milliseconds
      simulationDuration: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
      tenantActivityLevel: 0.3, // 0-1, how often tenants use the elevator
      ...config
    };
    
    this.name = `Cleaning Scenario (${this.config.floors} floors, ${this.config.cleaningBots} bots, ${this.config.tenants} tenants)`;
    this.duration = this.config.simulationDuration;
    
    // Generate steps for the scenario
    this.steps = this.generateScenarioSteps();
    
    // Define completion handler
    this.onComplete = (simulator) => {
      console.log('\n=== Cleaning Scenario Completed ===');
      
      // Calculate statistics
      const cleanedFloors = new Set();
      simulator.robots.forEach(robot => {
        if (robot.config.type === 'cleaner') {
          robot.visitedFloors.forEach(floor => cleanedFloors.add(floor));
        }
      });
      
      console.log(`\nCleaning Statistics:`);
      console.log(`Total floors in building: ${this.config.floors}`);
      console.log(`Floors cleaned: ${cleanedFloors.size}`);
      console.log(`Cleaning coverage: ${Math.round((cleanedFloors.size / this.config.floors) * 100)}%`);
      
      // Elevator usage statistics
      const totalRequests = simulator.elevators[0].totalRequests || 0;
      const botRequests = simulator.elevators[0].botRequests || 0;
      const tenantRequests = simulator.elevators[0].tenantRequests || 0;
      
      console.log(`\nElevator Usage Statistics:`);
      console.log(`Total elevator requests: ${totalRequests}`);
      console.log(`Cleaning bot requests: ${botRequests} (${Math.round((botRequests / totalRequests) * 100)}%)`);
      console.log(`Tenant requests: ${tenantRequests} (${Math.round((tenantRequests / totalRequests) * 100)}%)`);
      
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
    };
  }
  
  generateScenarioSteps() {
    const steps = [];
    
    // Initialize cleaning bots with their cleaning schedule
    for (let i = 0; i < this.config.cleaningBots; i++) {
      steps.push({
        time: 1000 + (i * 2000), // Stagger start times
        description: `Initialize cleaning bot ${i+1} schedule`,
        action: (simulator) => {
          const robot = simulator.robots[i];
          
          // Set robot type to cleaner
          robot.config.type = 'cleaner';
          
          // Initialize tracking of visited floors
          robot.visitedFloors = new Set();
          
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
          
          // Override requestFloor to track statistics
          const originalRequestFloor = elevator.requestFloor.bind(elevator);
          elevator.requestFloor = function(floorNumber, requesterType) {
            this.totalRequests++;
            if (requesterType === 'bot') {
              this.botRequests++;
            } else if (requesterType === 'tenant') {
              this.tenantRequests++;
            }
            return originalRequestFloor(floorNumber);
          };
        });
      }
    });
    
    return steps;
  }
  
  startCleaningCycle(robot, startFloor, simulator) {
    // Get a reference to the elevator for statistics
    const elevator = simulator.elevators[0];
    
    // Function to clean a floor then move to the next
    const cleanFloor = (floorNumber) => {
      console.log(`Cleaning bot ${robot.config.name} starting to clean floor ${floorNumber}`);
      
      // Mark this floor as visited
      robot.visitedFloors.add(floorNumber);
      
      // Simulate cleaning time
      setTimeout(() => {
        console.log(`Cleaning bot ${robot.config.name} finished cleaning floor ${floorNumber}`);
        
        // Move to next floor if simulation is still running
        if (simulator.running) {
          const nextFloor = this.getNextFloorToClean(robot);
          
          // Request elevator with 'bot' type for statistics
          robot.goToFloor(nextFloor)
            .then(() => {
              // Start cleaning the next floor
              cleanFloor(nextFloor);
            })
            .catch(err => {
              console.error(`Error moving cleaning bot to floor ${nextFloor}:`, err);
            });
        }
      }, this.config.cleaningTimePerFloor / simulator.config.simulationSpeed);
    };
    
    // Start the cleaning cycle at the specified floor
    robot.goToFloor(startFloor)
      .then(() => {
        cleanFloor(startFloor);
      })
      .catch(err => {
        console.error(`Error moving cleaning bot to starting floor:`, err);
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
            // Create a virtual tenant request
            console.log(`Tenant ${i+1} calling elevator to go to floor ${destinationFloor}`);
            
            // Request elevator with 'tenant' type for statistics
            simulator.elevators[0].requestFloor(currentFloor, 'tenant');
            
            // Simulate tenant entering elevator and requesting destination
            setTimeout(() => {
              if (simulator.elevators[0].state.currentFloor === currentFloor && 
                  simulator.elevators[0].state.doorState === 'OPEN') {
                console.log(`Tenant ${i+1} entered elevator and requested floor ${destinationFloor}`);
                simulator.elevators[0].requestFloor(destinationFloor, 'tenant');
              } else {
                console.log(`Tenant ${i+1} missed the elevator or got impatient`);
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