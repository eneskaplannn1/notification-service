const axios = require('axios');

class NotificationClient {
  constructor(baseURL = 'http://localhost:3001') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Register a user for notifications
  async registerUser(userId, pushToken, deviceId) {
    try {
      const response = await this.client.post('/register', {
        userId,
        pushToken,
        deviceId,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to register user: ${error.response?.data?.error || error.message}`);
    }
  }

  // Unregister a user
  async unregisterUser(userId) {
    try {
      const response = await this.client.delete(`/unregister/${userId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to unregister user: ${error.response?.data?.error || error.message}`);
    }
  }

  // Send notification to all users
  async notifyAll(title, body, data = {}) {
    try {
      const response = await this.client.post('/notify/all', {
        title,
        body,
        data,
      });
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to send notification to all users: ${error.response?.data?.error || error.message}`
      );
    }
  }

  // Send notification to specific users
  async notifyUsers(userIds, title, body, data = {}) {
    try {
      const response = await this.client.post('/notify/users', {
        userIds,
        title,
        body,
        data,
      });
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to send notification to specific users: ${error.response?.data?.error || error.message}`
      );
    }
  }

  // Send reminder notifications
  async sendReminders(reminders) {
    try {
      const response = await this.client.post('/notify/reminders', {
        reminders,
      });
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to send reminder notifications: ${error.response?.data?.error || error.message}`
      );
    }
  }

  // Get notification history
  async getNotificationHistory(limit = 50) {
    try {
      const response = await this.client.get(`/notifications?limit=${limit}`);
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to get notification history: ${error.response?.data?.error || error.message}`
      );
    }
  }

  // Get registered users
  async getRegisteredUsers() {
    try {
      const response = await this.client.get('/users');
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to get registered users: ${error.response?.data?.error || error.message}`
      );
    }
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(`Health check failed: ${error.response?.data?.error || error.message}`);
    }
  }
}

module.exports = NotificationClient;
