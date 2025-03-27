console.log('Starting simulation...');

try {
  const { runSimulation } = require('./src/index');
  console.log('Loaded simulation module');
  runSimulation();
} catch (error) {
  console.error('Error loading or running simulation:', error);
} 