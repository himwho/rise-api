/**
 * BasicScenario.js
 * 
 * A basic test scenario for the elevator and robot interaction
 */

class BasicScenario {
  constructor() {
    this.name = 'Basic Elevator-Robot Interaction';
    this.duration = 60000; // 60 seconds
    
    this.steps = [
      {
        time: 2000,
        description: 'Robot 1 requests to go to floor 5',
        action: (simulator) => {
          simulator.robots[0].goToFloor(5);
        }
      },
      {
        time: 15000,
        description: 'Robot 2 requests to go to floor 3',
        action: (simulator) => {
          if (simulator.robots.length > 1) {
            simulator.robots[1].goToFloor(3);
          }
        }
      },
      {
        time: 30000,
        description: 'Simulate door obstruction',
        action: (simulator) => {
          simulator.elevators[0].setDoorObstruction(true);
          
          // Clear obstruction after 3 seconds
          setTimeout(() => {
            simulator.elevators[0].setDoorObstruction(false);
          }, 3000);
        }
      },
      {
        time: 45000,
        description: 'Robot 1 requests to return to floor 1',
        action: (simulator) => {
          simulator.robots[0].goToFloor(1);
        }
      }
    ];
    
    this.onComplete = (simulator) => {
      console.log('Scenario completed. Final state:');
      console.log('Elevator positions:');
      simulator.elevators.forEach((elevator, i) => {
        const state = elevator.getState();
        console.log(`  Elevator ${i+1}: Floor ${state.currentFloor}`);
      });
      
      console.log('Robot positions:');
      simulator.robots.forEach((robot, i) => {
        const state = robot.getState();
        console.log(`  Robot ${i+1}: Floor ${state.currentFloor}`);
      });
    };
  }
}

module.exports = BasicScenario; 