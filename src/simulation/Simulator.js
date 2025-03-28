/**
 * Simulator.js
 * 
 * Simulation environment for testing the elevator and robot interaction
 */

const VirtualElevator = require('../elevator/VirtualElevator');
const VirtualRobot = require('../client/VirtualRobot');
const AsciiVisualizer = require('../visualization/AsciiVisualizer');

class Simulator {
  constructor(config = {}) {
    this.config = {
      elevatorCount: 1,
      robotCount: 1,
      floors: 10,
      simulationSpeed: 1.0, // 1.0 = real-time, 2.0 = 2x speed
      visualize: false, // New option for visualization
      ...config
    };
    
    this.elevators = [];
    this.robots = [];
    this.tenants = [];
    this.time = 0;
    this.running = false;
    this.eventLog = [];
    this.currentScenario = null;
    this.currentStep = 0;
    this.startTime = null;
    
    this.initialize();
    
    // Initialize visualizer if enabled
    if (this.config.visualize) {
      this.visualizer = new AsciiVisualizer({
        floors: this.config.floors,
        elevators: this.config.elevatorCount,
        refreshRate: 1000 / this.config.simulationSpeed
      });
      this.visualizer.initialize(this);
    } else {
      this.visualizer = null;
    }
  }
  
  initialize() {
    // Create elevators
    for (let i = 0; i < this.config.elevatorCount; i++) {
      const elevator = new VirtualElevator({
        id: `elevator-${i+1}`,
        floors: this.config.floors,
        doorOpenTime: 5000 / this.config.simulationSpeed,
        floorTravelTime: 2000 / this.config.simulationSpeed
      });
      
      this.elevators.push(elevator);
    }
    
    // Create robots
    for (let i = 0; i < this.config.robotCount; i++) {
      const robot = new VirtualRobot({
        name: `Robot-${i+1}`,
        type: 'cleaner'
      });
      
      // Connect robot to first elevator
      robot.connectToElevator(this.elevators[0]);
      
      this.robots.push(robot);
    }
    
    console.log(`Simulation initialized with ${this.config.elevatorCount} elevators and ${this.config.robotCount} robots`);
  }
  
  start() {
    if (this.running) return;
    
    this.running = true;
    this.time = 0;
    console.log('Simulation started');
    
    this.tick();
  }
  
  stop() {
    this.running = false;
    console.log('Simulation stopped');
  }
  
  tick() {
    if (!this.running) return;
    
    this.time += 100; // 100ms per tick
    
    // Log states periodically
    if (this.time % 1000 === 0) {
      this.logState();
      
      // Visual indicator
      process.stdout.write('.');
      if (this.time % 10000 === 0) {
        process.stdout.write('\n');
      }
      
      // Every minute, log detailed statistics
      if (this.time % 60000 === 0) {
        const minutes = this.time / 60000;
        console.log(`\n=== Simulation Progress: ${minutes} minutes ===`);
        
        // Log cleaning progress
        this.robots.forEach((robot, i) => {
          if (robot.config.type === 'cleaner' && robot.visitedFloors) {
            console.log(`Robot ${i+1} has cleaned ${robot.visitedFloors.size} floors so far`);
          }
        });
        
        // Log elevator statistics
        this.elevators.forEach((elevator, i) => {
          console.log(`Elevator ${i+1} has handled ${elevator.totalRequests || 0} requests (${elevator.botRequests || 0} from bots, ${elevator.tenantRequests || 0} from tenants)`);
        });
      }
    }
    
    // Schedule next tick
    setTimeout(() => this.tick(), 100 / this.config.simulationSpeed);
  }
  
  logState() {
    const state = {
      time: this.time,
      elevators: this.elevators.map(e => e.getState()),
      robots: this.robots.map(r => r.getState())
    };
    
    this.eventLog.push(state);
    
    // Log to console in a readable format
    console.log(`\n=== Simulation Time: ${this.time/1000}s ===`);
    
    this.elevators.forEach((elevator, i) => {
      const state = elevator.getState();
      console.log(`Elevator ${i+1}: Floor ${state.currentFloor}, Door ${state.doorState}, Direction ${state.direction}`);
    });
    
    this.robots.forEach((robot, i) => {
      const state = robot.getState();
      console.log(`Robot ${i+1}: Floor ${state.currentFloor}, Status ${state.status}`);
    });
  }
  
  // Run a test scenario
  runScenario(scenario) {
    console.log(`Running scenario: ${scenario.name}`);
    this.running = true;
    this.timeouts = [];
    this.intervals = [];
    
    // Initialize visualizer if enabled
    if (this.config.visualize && this.visualizer) {
      this.visualizer.initialize(this);
    }
    
    // Run each step at its scheduled time
    scenario.steps.forEach(step => {
      const timeoutId = setTimeout(() => {
        if (!this.running) return;
        
        console.log(`Executing step: ${step.description}`);
        step.action(this);
      }, step.time / this.config.simulationSpeed);
      
      this.timeouts.push(timeoutId);
    });
    
    // Schedule scenario completion
    const completionTimeoutId = setTimeout(() => {
      console.log(`\nSimulation stopped`);
      console.log(`Scenario ${scenario.name} completed\n`);
      
      this.stopSimulation();
      
      if (scenario.onComplete) {
        scenario.onComplete(this);
      }
      
      // Stop visualizer if enabled
      if (this.config.visualize && this.visualizer) {
        this.visualizer.stop();
      }
    }, scenario.duration / this.config.simulationSpeed);
    
    this.timeouts.push(completionTimeoutId);
  }
  
  // Get simulation results
  getResults() {
    return {
      duration: this.time,
      events: this.eventLog,
      finalState: {
        elevators: this.elevators.map(e => e.getState()),
        robots: this.robots.map(r => r.getState())
      }
    };
  }
  
  stopSimulation() {
    this.running = false;
    
    // Clear all pending timeouts
    if (this.timeouts) {
      this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    }
    
    // Clear all pending intervals
    if (this.intervals) {
      this.intervals.forEach(intervalId => clearInterval(intervalId));
    }
    
    console.log('\n========== SIMULATION ENDED ==========\n');
  }
}

module.exports = Simulator; 