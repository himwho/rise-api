/**
 * ElevatorAPI.js
 * 
 * API for interacting with elevators using the CANopen protocol
 */

class ElevatorAPI {
    constructor(transport) {
      this.transport = transport; // Communication transport (CANopen, TCP/IP, etc.)
      this.connected = false;
      this.eventHandlers = {
        'floorChanged': [],
        'doorStateChanged': [],
        'directionChanged': [],
        'emergencyStateChanged': [],
      };
    }
    
    // Connect to elevator system
    async connect() {
      try {
        await this.transport.connect();
        this.connected = true;
        
        // Start listening for events
        this.transport.on('message', this.handleMessage.bind(this));
        
        return true;
      } catch (error) {
        console.error('Failed to connect to elevator:', error);
        return false;
      }
    }
    
    // Disconnect from elevator system
    async disconnect() {
      if (!this.connected) return true;
      
      try {
        await this.transport.disconnect();
        this.connected = false;
        return true;
      } catch (error) {
        console.error('Failed to disconnect from elevator:', error);
        return false;
      }
    }
    
    // Handle incoming messages from elevator
    handleMessage(message) {
      // Parse CANopen message
      const { index, subIndex, data } = this.parseCANopenMessage(message);
      
      // Handle based on object index
      switch (index) {
        case 0x6001: // Current floor
          this.notifyListeners('floorChanged', data);
          break;
        case 0x6000: // Elevator status
          this.handleStatusChange(data);
          break;
        case 0x1002: // Manufacturer status (emergency)
          if (data & 0x1) {
            this.notifyListeners('emergencyStateChanged', true);
          }
          break;
      }
    }
    
    // Parse CANopen message
    parseCANopenMessage(message) {
      // In a real implementation, this would parse the CAN frame
      // For simulation, we assume a simplified format
      return {
        index: message.index,
        subIndex: message.subIndex || 0,
        data: message.data
      };
    }
    
    // Handle status change messages
    handleStatusChange(status) {
      // Door state bits
      if (status & 0x1) {
        this.notifyListeners('doorStateChanged', 'OPEN');
      } else if (status & 0x2) {
        this.notifyListeners('doorStateChanged', 'OPENING');
      } else if (status & 0x8) {
        this.notifyListeners('doorStateChanged', 'CLOSING');
      } else if (status & 0x10) {
        this.notifyListeners('doorStateChanged', 'CLOSED');
      }
      
      // Direction bits
      if (status & 0x20) {
        this.notifyListeners('directionChanged', 'UP');
      } else if (status & 0x40) {
        this.notifyListeners('directionChanged', 'DOWN');
      } else {
        this.notifyListeners('directionChanged', 'STATIONARY');
      }
    }
    
    // Request elevator to a specific floor
    async requestFloor(floorNumber) {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Write to CANopen object 0x6002 (target floor)
        await this.transport.sendMessage({
          index: 0x6002,
          data: floorNumber
        });
        
        return true;
      } catch (error) {
        console.error('Failed to request floor:', error);
        return false;
      }
    }
    
    // Get current floor
    async getCurrentFloor() {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Read CANopen object 0x6001 (current floor)
        const response = await this.transport.sendMessage({
          index: 0x6001,
          isRead: true
        });
        
        return response.data;
      } catch (error) {
        console.error('Failed to get current floor:', error);
        return null;
      }
    }
    
    // Get door state
    async getDoorState() {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Read CANopen object 0x6000 (status)
        const response = await this.transport.sendMessage({
          index: 0x6000,
          isRead: true
        });
        
        const status = response.data;
        
        if (status & 0x1) return 'OPEN';
        if (status & 0x2) return 'OPENING';
        if (status & 0x8) return 'CLOSING';
        if (status & 0x10) return 'CLOSED';
        
        return 'UNKNOWN';
      } catch (error) {
        console.error('Failed to get door state:', error);
        return null;
      }
    }
    
    // Command door to open
    async openDoor() {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Write to CANopen object 0x6010 (door command)
        await this.transport.sendMessage({
          index: 0x6010,
          data: 1 // Open command
        });
        
        return true;
      } catch (error) {
        console.error('Failed to open door:', error);
        return false;
      }
    }
    
    // Command door to close
    async closeDoor() {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Write to CANopen object 0x6010 (door command)
        await this.transport.sendMessage({
          index: 0x6010,
          data: 0 // Close command
        });
        
        return true;
      } catch (error) {
        console.error('Failed to close door:', error);
        return false;
      }
    }
    
    // Get direction of travel
    async getDirection() {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Read CANopen object 0x6000 (status)
        const response = await this.transport.sendMessage({
          index: 0x6000,
          isRead: true
        });
        
        const status = response.data;
        
        if (status & 0x20) return 'UP';
        if (status & 0x40) return 'DOWN';
        return 'STATIONARY';
      } catch (error) {
        console.error('Failed to get direction:', error);
        return null;
      }
    }
    
    // Check if elevator is in emergency state
    async isInEmergencyState() {
      if (!this.connected) {
        throw new Error('Not connected to elevator');
      }
      
      try {
        // Read CANopen object 0x1002 (manufacturer status)
        const response = await this.transport.sendMessage({
          index: 0x1002,
          isRead: true
        });
        
        return (response.data & 0x1) !== 0;
      } catch (error) {
        console.error('Failed to check emergency state:', error);
        return null;
      }
    }
    
    // Register event listener
    on(event, callback) {
      if (this.eventHandlers[event]) {
        this.eventHandlers[event].push(callback);
      }
      return this;
    }
    
    // Remove event listener
    off(event, callback) {
      if (this.eventHandlers[event]) {
        this.eventHandlers[event] = this.eventHandlers[event].filter(cb => cb !== callback);
      }
      return this;
    }
    
    // Notify listeners of an event
    notifyListeners(event, data) {
      if (this.eventHandlers[event]) {
        this.eventHandlers[event].forEach(callback => callback(data));
      }
    }
}

module.exports = ElevatorAPI;