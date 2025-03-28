/**
 * AsciiVisualizer.js
 * 
 * ASCII art visualization for the elevator simulation
 */

class AsciiVisualizer {
  constructor(config = {}) {
    this.config = {
      floors: 10,
      elevators: 1,
      width: 80,
      refreshRate: 500, // ms
      ...config
    };
    
    this.state = {
      elevators: [], // Array of elevator states
      robots: [],    // Array of robot states
      tenants: [],   // Array of tenant states (waiting, in elevator, etc.)
      lastRender: Date.now()
    };
    
    this.refreshInterval = null;
  }
  
  // Initialize the visualizer with simulator data
  initialize(simulator) {
    this.simulator = simulator;
    this.config.floors = simulator.config.floors;
    this.config.elevators = simulator.elevators.length;
    
    // Clear the console and start the refresh interval
    console.clear();
    this.refreshInterval = setInterval(() => this.render(), this.config.refreshRate);
    
    // Register for elevator events
    simulator.elevators.forEach((elevator, index) => {
      elevator.addEventListener('floorChanged', (floor) => {
        this.updateElevatorState(index, { currentFloor: floor });
      });
      
      elevator.addEventListener('doorStateChanged', (doorState) => {
        this.updateElevatorState(index, { doorState });
      });
      
      elevator.addEventListener('directionChanged', (direction) => {
        this.updateElevatorState(index, { direction });
      });
    });
    
    // Initialize elevator states
    this.state.elevators = simulator.elevators.map(elevator => ({
      currentFloor: elevator.state.currentFloor,
      doorState: elevator.state.doorState,
      direction: elevator.state.direction,
      requests: new Set(),
      occupants: []
    }));
    
    // Initialize robot states
    this.state.robots = simulator.robots.map(robot => ({
      id: robot.config.name,
      currentFloor: robot.state.currentFloor,
      status: robot.state.status,
      targetFloor: robot.state.targetFloor,
      batteryLevel: robot.state.batteryPercentage || 100
    }));
    
    // Track tenant activity
    this.trackTenantActivity();
  }
  
  // Update elevator state
  updateElevatorState(elevatorIndex, updates) {
    if (this.state.elevators[elevatorIndex]) {
      Object.assign(this.state.elevators[elevatorIndex], updates);
    }
  }
  
  // Track tenant activity by monitoring elevator requests
  trackTenantActivity() {
    // Store original methods
    this.simulator.elevators.forEach((elevator, elevatorIndex) => {
      const originalRequestFloor = elevator.requestFloor.bind(elevator);
      
      // Override the requestFloor method to track tenant activity
      elevator.requestFloor = (floorNumber, requesterType, occupantId, destination) => {
        // Call the original method
        const result = originalRequestFloor(floorNumber, requesterType, occupantId, destination);
        
        // Track the request
        if (requesterType === 'tenant') {
          // Add to elevator requests
          this.state.elevators[elevatorIndex].requests.add(floorNumber);
          
          // If no occupantId was provided, generate one
          const tenantId = occupantId || `tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
          // Check if this tenant is already being tracked
          const existingTenant = this.state.tenants.find(t => t.id === tenantId);
          
          if (!existingTenant) {
            // Create a new tenant
            this.state.tenants.push({
              id: tenantId,
              currentFloor: floorNumber,
              status: 'WAITING',
              targetFloor: destination,
              elevatorIndex
            });
          } else if (existingTenant.status === 'IN_ELEVATOR') {
            // This is a destination request from inside the elevator
            existingTenant.targetFloor = floorNumber;
            
            // Update the occupant in our visualization state
            if (this.state.elevators[elevatorIndex].occupants) {
              const occupant = this.state.elevators[elevatorIndex].occupants.find(o => 
                typeof o === 'object' && o.id === tenantId
              );
              
              if (occupant) {
                occupant.destination = floorNumber;
              }
            }
          }
          
          // Set up a listener to detect when the tenant enters the elevator
          const doorStateListener = (doorState) => {
            if (doorState === 'OPEN' && elevator.state.currentFloor === floorNumber) {
              // Find the tenant
              const tenant = this.state.tenants.find(t => t.id === tenantId && t.status === 'WAITING');
              if (tenant) {
                // Update tenant status
                tenant.status = 'IN_ELEVATOR';
                
                // Add to elevator occupants if not already there
                if (!elevator.state.occupants.some(o => o.id === tenantId)) {
                  // Update our visualization state
                  if (!this.state.elevators[elevatorIndex].occupants) {
                    this.state.elevators[elevatorIndex].occupants = [];
                  }
                  
                  // Add to our visualization state
                  this.state.elevators[elevatorIndex].occupants.push({
                    id: tenantId,
                    type: 'tenant',
                    destination: tenant.targetFloor || destination
                  });
                }
                
                // Remove from elevator requests
                this.state.elevators[elevatorIndex].requests.delete(floorNumber);
                
                // Remove the listener
                elevator.removeEventListener('doorStateChanged', doorStateListener);
              }
            }
          };
          
          elevator.addEventListener('doorStateChanged', doorStateListener);
        } else if (requesterType === 'bot') {
          // Track bot requests separately
          this.state.elevators[elevatorIndex].requests.add(floorNumber);
        }
        
        return result;
      };
      
      // Also track when occupants exit the elevator
      const originalRemoveOccupant = elevator.removeOccupant.bind(elevator);
      elevator.removeOccupant = (occupantId) => {
        // Call the original method
        originalRemoveOccupant(occupantId);
        
        // Update our visualization state
        if (this.state.elevators[elevatorIndex].occupants) {
          this.state.elevators[elevatorIndex].occupants = 
            this.state.elevators[elevatorIndex].occupants.filter(o => 
              typeof o === 'object' && o.id !== occupantId
            );
        }
        
        // Update tenant status
        const tenant = this.state.tenants.find(t => t.id === occupantId);
        if (tenant) {
          tenant.status = 'EXITED';
          tenant.currentFloor = elevator.state.currentFloor;
        }
      };
      
      // Track when occupant destinations are set
      const originalSetOccupantDestination = elevator.setOccupantDestination.bind(elevator);
      elevator.setOccupantDestination = (occupantId, destinationFloor) => {
        // Call the original method
        originalSetOccupantDestination(occupantId, destinationFloor);
        
        // Update our visualization state
        if (this.state.elevators[elevatorIndex].occupants) {
          const occupant = this.state.elevators[elevatorIndex].occupants.find(o => 
            typeof o === 'object' && o.id === occupantId
          );
          
          if (occupant) {
            occupant.destination = destinationFloor;
          }
        }
        
        // Update tenant status
        const tenant = this.state.tenants.find(t => t.id === occupantId);
        if (tenant) {
          tenant.targetFloor = destinationFloor;
        }
      };
    });
  }
  
  // Render the ASCII visualization
  render() {
    // Skip rendering if too soon since last render
    const now = Date.now();
    if (now - this.state.lastRender < this.config.refreshRate) {
      return;
    }
    this.state.lastRender = now;
    
    // Update elevator and robot states from simulator
    this.updateStates();
    
    // Clear the console
    console.clear();
    
    // Build the visualization
    const lines = [];
    
    // Add header
    lines.push('=== Elevator Simulation Visualization ===');
    lines.push('');
    
    // Add floor numbers and elevator shafts
    for (let floor = this.config.floors; floor >= 1; floor--) {
      let floorLine = `${floor.toString().padStart(2)} |`;
      
      // Add waiting tenants on the left
      const waitingTenants = this.simulator.tenants ? 
        this.simulator.tenants.filter(t => 
          t.state.currentFloor === floor && t.state.status === 'WAITING'
        ) : [];
      
      // Fix: Ensure we don't try to repeat with a negative value
      const tenantCount = Math.min(waitingTenants.length, 5); // Cap at 5 tenants shown
      const spacesNeeded = Math.max(0, 5 - tenantCount); // Ensure non-negative
      
      floorLine += waitingTenants.slice(0, 5).map(t => 'T').join('') + ' '.repeat(spacesNeeded);
      
      // Add elevator shafts
      for (let e = 0; e < this.config.elevators; e++) {
        // Ensure elevator state is valid - use default values if not
        const elevator = this.state.elevators[e] || { 
          currentFloor: 1, 
          doorState: 'CLOSED', 
          direction: 'STATIONARY',
          occupants: [] 
        };
        
        // Ensure currentFloor is a valid number
        const currentFloor = typeof elevator.currentFloor === 'number' ? elevator.currentFloor : 1;
        
        if (currentFloor === floor) {
          // Render elevator at this floor
          if (elevator.doorState === 'OPEN' || elevator.doorState === 'OPENING') {
            floorLine += '[| |]'; // Open elevator
          } else {
            floorLine += '[|||]'; // Closed elevator
          }
          
          // Add elevator occupants
          const occupants = elevator.occupants ? elevator.occupants.length : 0;
          if (occupants > 0) {
            floorLine += `(${occupants})`;
          } else {
            floorLine += '   ';
          }
        } else {
          // Render empty shaft
          floorLine += ' | | ';
          
          // Add placeholder for occupants
          floorLine += '   ';
        }
      }
      
      // Add robots on this floor
      const robotsOnFloor = this.state.robots.filter(r => r.currentFloor === floor);
      if (robotsOnFloor.length > 0) {
        floorLine += ' ' + robotsOnFloor.map(r => 'R').join('');
      }
      
      lines.push(floorLine);
    }
    
    // Add floor
    lines.push('---' + '-'.repeat(this.config.elevators * 8));
    
    // Add legend
    lines.push('');
    lines.push('Legend: T = Tenant waiting, R = Robot, [|||] = Closed elevator, [| |] = Open elevator');
    
    // Add elevator status
    lines.push('');
    lines.push('Elevator Status:');
    this.state.elevators.forEach((elevator, i) => {
      // Ensure elevator state is valid
      const currentFloor = elevator.currentFloor !== null ? elevator.currentFloor : 'unknown';
      const doorState = elevator.doorState || 'unknown';
      const direction = elevator.direction || 'unknown';
      
      lines.push(`  Elevator ${i+1}: Floor ${currentFloor}, Door ${doorState}, Direction ${direction}`);
      lines.push(`    Requests: ${Array.from(elevator.requests).join(', ') || 'None'}`);
      
      // Show occupants and their destinations
      if (elevator.occupants && elevator.occupants.length > 0) {
        lines.push(`    Occupants (${elevator.occupants.length}/${this.simulator.elevators[i].config.maxOccupants}):`);
        elevator.occupants.forEach(occupant => {
          // Check if occupant is a valid object with an id
          if (occupant && typeof occupant === 'object' && occupant.id) {
            lines.push(`      ${occupant.id.substring(0, 10)}... (${occupant.type}) → Floor ${occupant.destination || '?'}`);
          } else if (typeof occupant === 'string') {
            // Handle case where occupant is just a string ID
            lines.push(`      ${occupant.substring(0, 10)}... → Floor ?`);
          } else {
            // Handle invalid occupant
            lines.push(`      Unknown occupant`);
          }
        });
      } else {
        lines.push(`    Occupants: None`);
      }
    });
    
    // Add robot status
    lines.push('');
    lines.push('Robot Status:');
    this.state.robots.forEach((robot, i) => {
      lines.push(`  Robot ${i+1}: Floor ${robot.currentFloor}, Status ${robot.status}, Battery ${robot.batteryLevel}%`);
    });
    
    // Add tenant count
    lines.push('');
    const waitingTenants = this.simulator.tenants ? 
      this.simulator.tenants.filter(t => t.state.status === 'WAITING').length : 0;
    const inElevatorTenants = this.simulator.tenants ? 
      this.simulator.tenants.filter(t => t.state.status === 'IN_ELEVATOR').length : 0;
    const exitedTenants = this.simulator.tenants ? 
      this.simulator.tenants.filter(t => t.state.status === 'EXITED').length : 0;
    
    lines.push(`Tenants: ${this.simulator.tenants ? this.simulator.tenants.length : 0} total, ${waitingTenants} waiting, ${inElevatorTenants} in elevator, ${exitedTenants} exited`);
    
    // Print the visualization
    console.log(lines.join('\n'));
  }
  
  // Stop the visualizer
  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
  
  // Add a method to update states from the simulator
  updateStates() {
    // Update elevator states
    this.simulator.elevators.forEach((elevator, index) => {
      // Ensure elevator state is valid
      if (!elevator || !elevator.state) {
        console.error(`Invalid elevator state for elevator ${index}`);
        return;
      }
      
      if (!this.state.elevators[index]) {
        this.state.elevators[index] = {
          currentFloor: elevator.state.currentFloor || 1, // Default to floor 1 if null
          doorState: elevator.state.doorState || 'CLOSED',
          direction: elevator.state.direction || 'STATIONARY',
          requests: new Set(elevator.state.floorRequests || []), // Copy floor requests
          occupants: []
        };
      } else {
        // Ensure currentFloor is a valid number
        if (elevator.state.currentFloor === null || elevator.state.currentFloor === undefined) {
          console.error(`Elevator ${index} has null currentFloor, defaulting to 1`);
          elevator.state.currentFloor = 1;
        }
        
        this.state.elevators[index].currentFloor = elevator.state.currentFloor;
        this.state.elevators[index].doorState = elevator.state.doorState;
        this.state.elevators[index].direction = elevator.state.direction;
        
        // Update requests from the actual elevator state
        this.state.elevators[index].requests = new Set(elevator.state.floorRequests || []);
        
        // Update occupants from the actual elevator state
        if (elevator.state.occupants) {
          this.state.elevators[index].occupants = [...elevator.state.occupants];
        }
      }
    });
    
    // Update robot states
    this.simulator.robots.forEach((robot, index) => {
      if (!this.state.robots[index]) {
        this.state.robots[index] = {
          id: robot.config.name,
          currentFloor: robot.state.currentFloor,
          status: robot.state.status,
          targetFloor: robot.state.targetFloor,
          batteryLevel: robot.state.batteryPercentage || 100
        };
      } else {
        this.state.robots[index].currentFloor = robot.state.currentFloor;
        this.state.robots[index].status = robot.state.status;
        this.state.robots[index].targetFloor = robot.state.targetFloor;
        this.state.robots[index].batteryLevel = robot.state.batteryPercentage || 100;
      }
    });
  }
}

module.exports = AsciiVisualizer;