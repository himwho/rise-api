# rise

## Description

This repo contains tools and testing for constructing an API for enabling elevators to communicate their floor and door states to a server or the LAN and for other clients to request and receive information from the server or the LAN. The clients can also request the elevator through the LAN or the server to move to a specific floor.

We will start with some common elevator protocols such as the CANopen Elevator Protocol (CiA 417 profile), ASME A17.1 protocol and the KONE Elevator Control Network protocol.

## API

### Elevator

The elevator component implements the CANopen Elevator Protocol (CiA 417) to communicate its state and receive commands. It provides:

- Current floor position
- Door state (open, closed, opening, closing)
- Direction of travel (up, down, stationary)
- Ability to receive floor call requests
- Emergency state reporting

### Client

The client API allows robots and other devices to:

- Query elevator state (floor, door status, direction)
- Request elevator to a specific floor
- Receive notifications when elevator arrives
- Monitor door state to determine when to enter/exit

## Simulation

The repository includes a simulation environment to test the API:

- Virtual elevator implementing the CANopen protocol
- Virtual robot client that can navigate to/from the elevator
- Visualization of the elevator and robot states
- Scenario testing for common use cases

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Run the simulation:
   ```
   npm run simulate
   ```

3. Test the API:
   ```
   npm test
   ```

## Documentation

See the `/docs` directory for detailed API documentation and protocol specifications.
