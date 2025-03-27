/**
 * cli.js
 * 
 * Command-line interface for configuring and running the elevator simulation
 */

const readline = require('readline');
const Simulator = require('./simulation/Simulator');
const CleaningScenario = require('./scenarios/CleaningScenario');
const CANopenTransport = require('./transport/CANopenTransport');
const ElevatorAPI = require('./api/ElevatorAPI');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for a number
function promptNumber(question, defaultValue) {
  return new Promise((resolve) => {
    rl.question(`${question} (default: ${defaultValue}): `, (answer) => {
      const num = parseInt(answer);
      resolve(isNaN(num) ? defaultValue : num);
    });
  });
}

// Function to prompt for a yes/no question
function promptYesNo(question, defaultValue) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n, default: ${defaultValue ? 'y' : 'n'}): `, (answer) => {
      if (answer.trim().toLowerCase() === 'y') {
        resolve(true);
      } else if (answer.trim().toLowerCase() === 'n') {
        resolve(false);
      } else {
        resolve(defaultValue);
      }
    });
  });
}

// Main function to run the CLI
async function runCLI() {
  console.log('=== Elevator Cleaning Simulation Configuration ===\n');
  
  // Get configuration from user
  const floors = await promptNumber('Enter number of floors in the building', 10);
  const cleaningBots = await promptNumber('Enter number of cleaning robots', 2);
  const tenants = await promptNumber('Enter number of tenants in the building', 5);
  const simulationSpeed = await promptNumber('Enter simulation speed (1 = real-time, 10 = 10x speed)', 10);
  const simulationHours = await promptNumber('Enter simulation duration in hours', 2);
  const activityLevel = await promptNumber('Enter tenant activity level (1-10)', 5) / 10;
  
  console.log('\nConfiguration Summary:');
  console.log(`- Building: ${floors} floors`);
  console.log(`- Cleaning Robots: ${cleaningBots}`);
  console.log(`- Tenants: ${tenants}`);
  console.log(`- Simulation Speed: ${simulationSpeed}x`);
  console.log(`- Simulation Duration: ${simulationHours} hours`);
  console.log(`- Tenant Activity Level: ${activityLevel * 10}/10`);
  
  const confirm = await promptYesNo('\nStart simulation with these settings?', true);
  
  if (confirm) {
    rl.close();
    
    // Run the simulation with the configured settings
    runSimulation({
      floors,
      cleaningBots,
      tenants,
      simulationSpeed,
      simulationHours,
      activityLevel
    });
  } else {
    console.log('Simulation cancelled.');
    rl.close();
  }
}

// Function to run the simulation with the given configuration
function runSimulation(config) {
  console.log('\n=== Starting Elevator Cleaning Simulation ===\n');
  
  // Create simulator
  const simulator = new Simulator({
    elevatorCount: 1,
    robotCount: config.cleaningBots,
    floors: config.floors,
    simulationSpeed: config.simulationSpeed
  });
  
  // Create transport and API
  const transport = new CANopenTransport({
    simulationMode: true,
    virtualElevator: simulator.elevators[0]
  });
  
  const api = new ElevatorAPI(transport);
  
  // Connect API and run scenario
  api.connect().then(connected => {
    if (connected) {
      console.log('API connected to elevator system');
      
      // Create cleaning scenario
      const scenario = new CleaningScenario({
        floors: config.floors,
        cleaningBots: config.cleaningBots,
        tenants: config.tenants,
        simulationDuration: config.simulationHours * 60 * 60 * 1000,
        tenantActivityLevel: config.activityLevel
      });
      
      // Run the scenario
      simulator.runScenario(scenario);
    } else {
      console.error('Failed to connect API to elevator system');
    }
  }).catch(err => {
    console.error('Error connecting API:', err);
  });
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  runCLI();
}

module.exports = {
  runCLI
}; 