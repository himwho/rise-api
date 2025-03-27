/**
 * index.js
 * 
 * Main entry point for the elevator simulation
 */

const Simulator = require('./simulation/Simulator');
const BasicScenario = require('./scenarios/BasicScenario');
const CANopenTransport = require('./transport/CANopenTransport');
const ElevatorAPI = require('./api/ElevatorAPI');

// Create and run a simulation
function runSimulation() {
  console.log('Starting elevator simulation...');
  
  try {
    // Create simulator with 2 elevators and 2 robots
    console.log('Creating simulator...');
    const simulator = new Simulator({
      elevatorCount: 2,
      robotCount: 2,
      floors: 10,
      simulationSpeed: 1.0
    });
    
    // Create a transport connected to the first virtual elevator
    console.log('Creating transport...');
    const transport = new CANopenTransport({
      simulationMode: true,
      virtualElevator: simulator.elevators[0]
    });
    
    // Create an API using the transport
    console.log('Creating API...');
    const api = new ElevatorAPI(transport);
    
    // Connect the API
    console.log('Connecting API...');
    api.connect().then(connected => {
      if (connected) {
        console.log('API connected to elevator system');
        
        // Register for events
        api.on('floorChanged', floor => {
          console.log(`API Event: Floor changed to ${floor}`);
        });
        
        api.on('doorStateChanged', state => {
          console.log(`API Event: Door state changed to ${state}`);
        });
        
        // Run the basic scenario
        console.log('Running scenario...');
        const scenario = new BasicScenario();
        simulator.runScenario(scenario);
      } else {
        console.error('Failed to connect API to elevator system');
      }
    }).catch(err => {
      console.error('Error connecting API:', err);
    });
  } catch (error) {
    console.error('Error in simulation:', error);
  }
}

// Run the simulation if this file is executed directly
if (require.main === module) {
  console.log('Running simulation from command line');
  runSimulation();
}

module.exports = {
  runSimulation
}; 