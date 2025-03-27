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

// Add this function at the top of your CLI script, near the other prompt functions
function promptString(question, defaultValue = '') {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` (default: ${defaultValue})` : '';
    rl.question(`${question}${defaultText}: `, answer => {
      resolve(answer || defaultValue);
    });
  });
}

// Add this function at the top of your CLI script
function askQuestion(question, defaultValue = '') {
  return new Promise(resolve => {
    const defaultText = defaultValue ? ` (default: ${defaultValue})` : '';
    rl.question(`${question}${defaultText}: `, answer => {
      resolve(answer || defaultValue);
    });
  });
}

// Main function to run the CLI
async function runCLI() {
  console.log('=== Elevator Cleaning Simulation Configuration ===\n');
  
  // Get configuration from user
  const floors = await promptNumber('Enter number of floors in the building', 10);
  const elevators = await promptNumber('Enter number of elevators in the building', 1);
  const bots = await promptNumber('Enter number of robots', 1);
  
  // Remove tenant count prompt and enhance the activity level description
  const tenantActivityLevel = await promptNumber(
    'Enter building traffic level (1-10, where:\n' +
    '  1 = Very low (~1-2 elevator requests per hour)\n' +
    '  5 = Medium (~25 elevator requests per hour)\n' +
    '  10 = Very high (~100 elevator requests per hour)',
    5
  );
  
  const simulationSpeed = await promptNumber('Enter simulation speed (1 = real-time, 10 = 10x speed)', 10);
  const simulationHours = await promptNumber('Enter simulation duration in hours', 2);
  
  // Add new parameters to the CLI
  const prioritizationMode = await promptString(
    'Enter elevator prioritization mode (equal, tenant-priority, bot-priority)',
    'equal'
  );

  const batteryCapacity = await promptString(
    'Enter robot battery capacity in mAh (default: 5000): ', '5000'
  );

  const batteryConsumptionRate = await promptString(
    'Enter battery consumption rate in mAh per minute (default: 10): ', '10'
  );

  const useOffPeakHours = await promptYesNo(
    'Enable off-peak hours mode for cleaning? (y/n, default: n): ', false
  );

  let offPeakStartHour, offPeakEndHour;
  if (useOffPeakHours) {
    offPeakStartHour = await promptNumber('Enter off-peak start hour (0-23, default: 22): ', 22);
    
    offPeakEndHour = await promptNumber('Enter off-peak end hour (0-23, default: 6): ', 6);
  }
  
  const cleaningTimeMinutes = await promptNumber(
    'Enter cleaning time per floor in minutes',
    10
  );
  
  // Add a visualization option to the CLI
  const useVisualization = await promptYesNo(
    'Enable ASCII visualization? (y/n, default: n)',
    false
  );
  
  // Update the configuration summary
  console.log('\nConfiguration Summary:');
  console.log(`- Building: ${floors} floors`);
  console.log(`- Elevators: ${elevators}`);
  console.log(`- Robots: ${bots}`);
  console.log(`- Building Traffic: ${tenantActivityLevel}/10 (~${calculateHourlyRequests(tenantActivityLevel)} elevator requests per hour)`);
  console.log(`- Simulation Speed: ${simulationSpeed}x`);
  console.log(`- Simulation Duration: ${simulationHours} hours`);
  console.log(`- Cleaning Time Per Floor: ${cleaningTimeMinutes} minutes`);
  console.log(`- Elevator Prioritization: ${prioritizationMode}`);
  if (useOffPeakHours) {
    console.log(`- Off-Peak Hours: ${offPeakStartHour}:00 to ${offPeakEndHour}:00`);
  }
  console.log(`- ASCII Visualization: ${useVisualization ? 'Enabled' : 'Disabled'}`);
  
  const confirm = await promptYesNo('\nStart simulation with these settings?', true);
  
  if (confirm) {
    rl.close();
    
    // Run the simulation with the configured settings
    runSimulation({
      floors,
      elevators,
      bots,
      simulationSpeed,
      simulationHours,
      tenantActivityLevel: tenantActivityLevel / 10,
      prioritizationMode: prioritizationMode,
      batteryCapacity: parseInt(batteryCapacity) || 5000,
      batteryConsumptionRate: parseInt(batteryConsumptionRate) || 10,
      cleaningTimeMinutes: cleaningTimeMinutes,
      useOffPeakHours: useOffPeakHours,
      offPeakStartHour: offPeakStartHour,
      offPeakEndHour: offPeakEndHour,
      visualize: useVisualization
    });
  } else {
    console.log('Simulation cancelled.');
    rl.close();
  }
}

// Helper function to calculate hourly requests based on activity level
function calculateHourlyRequests(activityLevel) {
  // Scale from 1 request at level 1 to 100 requests at level 10
  return Math.round(1 + ((activityLevel - 1) / 9) * 99);
}

// Function to run the simulation with the given configuration
function runSimulation(config) {
  console.log('\n=== Starting Elevator Cleaning Simulation ===\n');
  
  // Create simulator
  const simulator = new Simulator({
    elevatorCount: config.elevators,
    robotCount: config.bots,
    floors: config.floors,
    simulationSpeed: config.simulationSpeed,
    visualize: config.visualize
  });
  
  // Create transports and APIs for each elevator
  const transports = [];
  const apis = [];
  
  for (let i = 0; i < config.elevators; i++) {
    const transport = new CANopenTransport({
      simulationMode: true,
      virtualElevator: simulator.elevators[i]
    });
    
    const api = new ElevatorAPI(transport);
    
    transports.push(transport);
    apis.push(api);
  }
  
  // Connect all APIs
  Promise.all(apis.map(api => api.connect()))
    .then(results => {
      const allConnected = results.every(result => result === true);
      
      if (allConnected) {
        console.log('All APIs connected to elevator systems');
        
        // Create cleaning scenario with updated parameters
        const scenario = new CleaningScenario({
          floors: config.floors,
          elevators: config.elevators,
          bots: config.bots,
          tenantActivityLevel: config.tenantActivityLevel,
          simulationDuration: config.simulationHours * 60 * 60 * 1000,
          prioritizationMode: config.prioritizationMode,
          batteryCapacity: config.batteryCapacity,
          batteryConsumptionRate: config.batteryConsumptionRate,
          cleaningTimeMinutes: config.cleaningTimeMinutes,
          useOffPeakHours: config.useOffPeakHours,
          offPeakStartHour: config.offPeakStartHour,
          offPeakEndHour: config.offPeakEndHour
        });
        
        // Run the scenario
        simulator.runScenario(scenario);
      } else {
        console.error('Failed to connect one or more APIs to elevator systems');
      }
    })
    .catch(err => {
      console.error('Error connecting APIs:', err);
    });
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  runCLI();
}

module.exports = {
  runCLI
}; 