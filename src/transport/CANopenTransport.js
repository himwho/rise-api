/**
 * CANopenTransport.js
 * 
 * Implementation of a CANopen transport layer for communication with elevators
 */

const EventEmitter = require('events');

class CANopenTransport extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      nodeId: 1, // CANopen node ID
      busSpeed: 250000, // CAN bus speed in bits/second
      simulationMode: true,
      ...config
    };
    
    this.connected = false;
    this.virtualElevator = config.virtualElevator || null;
    this.pendingRequests = new Map();
    this.requestId = 0;
  }
  
  // Connect to CAN bus
  async connect() {
    if (this.connected) return true;
    
    if (this.config.simulationMode) {
      // In simulation mode, we don't actually connect to hardware
      this.connected = true;
      
      // If we have a virtual elevator, set up event forwarding
      if (this.virtualElevator) {
        this.setupVirtualElevatorEvents();
      }
      
      return true;
    } else {
      // In real mode, we would connect to actual CAN hardware
      try {
        // Implementation would depend on the CAN hardware/driver being used
        // For example, using socketcan on Linux:
        // await this.canInterface.open('can0');
        
        this.connected = true;
        return true;
      } catch (error) {
        console.error('Failed to connect to CAN bus:', error);
        return false;
      }
    }
  }
  
  // Disconnect from CAN bus
  async disconnect() {
    if (!this.connected) return true;
    
    if (this.config.simulationMode) {
      this.connected = false;
      return true;
    } else {
      try {
        // Implementation would depend on the CAN hardware/driver being used
        // await this.canInterface.close();
        
        this.connected = false;
        return true;
      } catch (error) {
        console.error('Failed to disconnect from CAN bus:', error);
        return false;
      }
    }
  }
  
  // Set up event forwarding from virtual elevator
  setupVirtualElevatorEvents() {
    // Forward floor changes
    this.virtualElevator.addEventListener('floorChanged', (floor) => {
      this.emit('message', {
        index: 0x6001,
        data: floor
      });
    });
    
    // Forward door state changes
    this.virtualElevator.addEventListener('doorStateChanged', (doorState) => {
      let statusValue = this.virtualElevator.readObject(0x6000);
      this.emit('message', {
        index: 0x6000,
        data: statusValue
      });
    });
    
    // Forward direction changes
    this.virtualElevator.addEventListener('directionChanged', (direction) => {
      let statusValue = this.virtualElevator.readObject(0x6000);
      this.emit('message', {
        index: 0x6000,
        data: statusValue
      });
    });
    
    // Forward emergency state changes
    this.virtualElevator.addEventListener('emergencyStateChanged', (emergency) => {
      this.emit('message', {
        index: 0x1002,
        data: emergency ? 0x1 : 0x0
      });
    });
  }
  
  // Send a CANopen message
  async sendMessage(message) {
    if (!this.connected) {
      throw new Error('Not connected to CAN bus');
    }
    
    if (this.config.simulationMode && this.virtualElevator) {
      return this.handleSimulatedMessage(message);
    } else {
      // In real mode, we would send an actual CAN frame
      // Implementation would depend on the CAN hardware/driver being used
      
      // For example:
      // const canId = this.calculateCanId(message.index, message.isRead);
      // const data = Buffer.from([message.data]);
      // await this.canInterface.send({ id: canId, data });
      
      // For now, just return a dummy response
      return { success: true, data: 0 };
    }
  }
  
  // Handle a message in simulation mode
  handleSimulatedMessage(message) {
    if (message.isRead) {
      // Read from virtual elevator's object dictionary
      try {
        const value = this.virtualElevator.readObject(message.index);
        return { success: true, data: value };
      } catch (error) {
        console.error('Error reading object:', error);
        return { success: false, error };
      }
    } else {
      // Write to virtual elevator's object dictionary
      try {
        this.virtualElevator.writeObject(message.index, message.data);
        return { success: true };
      } catch (error) {
        console.error('Error writing object:', error);
        return { success: false, error };
      }
    }
  }
  
  // Calculate CANopen CAN ID
  calculateCanId(index, isRead) {
    if (isRead) {
      // SDO read request
      return 0x600 + this.config.nodeId;
    } else {
      // SDO write request
      return 0x580 + this.config.nodeId;
    }
  }
}

module.exports = CANopenTransport; 