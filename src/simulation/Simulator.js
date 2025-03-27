/**
 * Simulator.js
 * 
 * Simulation environment for testing the elevator and robot interaction
 */

const VirtualElevator = require('../elevator/VirtualElevator');
const VirtualRobot = require('../client/VirtualRobot');

class Simulator {
  constructor(config = {}) {
    this.config = {
      elevatorCount: 1,
      robotCount: 1,
      floors: 10,
      simulationSpeed: 1.0, // 1.0 = real-time, 2.0 = 2x speed
      ...config
    };
    
    this.elevators = [];
    this.robots = [];
    this.time = 0;
    this.running = false;
    this.eventLog = [];
    
    this.initialize();
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
        name: `robot-${i+1}`,
        startFloor: Math.floor(Math.random() * this.config.floors) + 1
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
    
    this.start();
    
    // Execute scenario steps
    scenario.steps.forEach(step => {
      setTimeout(() => {
        console.log(`Executing step: ${step.description}`);
        step.action(this);
      }, step.time / this.config.simulationSpeed);
    });
    
    // End scenario
    setTimeout(() => {
      this.stop();
      console.log(`Scenario ${scenario.name} completed`);
      
      if (scenario.onComplete) {
        scenario.onComplete(this);
      }
    }, scenario.duration / this.config.simulationSpeed);
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
}

module.exports = Simulator; 