# Plant Care Notification Service

This service handles push notifications for the plant care app, including automatic reminder scheduling and delivery.

## Features

- **Automatic Reminder Processing**: Cron job runs every 5 minutes to check for due reminders
- **Frequency Support**: Reminders can be set to repeat (once, daily, weekly, biweekly, monthly)
- **Database-Driven**: All reminders are stored in and fetched from Supabase
- **Smart Scheduling**: Automatically calculates next reminder times for recurring reminders
- **Notification Tracking**: Tracks when notifications were last sent to prevent duplicates

## Database Schema

### care_reminders Table

```sql
- id: UUID (Primary Key)
- user_plant_id: UUID (Foreign Key to user_plants)
- reminder_type: VARCHAR (watering, fertilizing, pruning, etc.)
- reminder_time: TIMESTAMP WITH TIME ZONE
- frequency: VARCHAR (once, daily, weekly, biweekly, monthly)
- message: TEXT
- last_notification_sent: TIMESTAMP WITH TIME ZONE (nullable)
```

## API Endpoints

### POST /notify/reminders

Fetches all reminders from the database and sends notifications for due reminders.

**Request**: No body required (fetches from database)

**Response**:

```json
{
  "success": true,
  "message": "Reminder notifications sent to 5 users",
  "tickets": [...],
  "sent": 5
}
```

### POST /notify/all

Sends a notification to all registered users.

**Request**:

```json
{
  "title": "Notification Title",
  "body": "Notification message",
  "data": { "optional": "data" }
}
```

### POST /notify/users

Sends a notification to specific users.

**Request**:

```json
{
  "userIds": ["user1", "user2"],
  "title": "Notification Title",
  "body": "Notification message",
  "data": { "optional": "data" }
}
```

## Reminder Logic

### Frequency Types

- **once**: One-time reminder, won't be sent again after first notification
- **daily**: Repeats every 24 hours after last notification
- **weekly**: Repeats every 7 days after last notification
- **biweekly**: Repeats every 14 days after last notification
- **monthly**: Repeats every 30 days after last notification

### When Reminders Are Sent

1. **First Time**: When `reminder_time` has passed and no `last_notification_sent` exists
2. **Recurring**: When enough time has passed since `last_notification_sent` based on frequency
3. **One-time**: Only sent once, never repeated

### Next Reminder Time Calculation

For recurring reminders, the system automatically calculates the next reminder time:

- Keeps the same time of day as the original reminder
- Updates the date based on frequency
- Updates the `reminder_time` field in the database

## Setup

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file with:

   ```
   PORT=3001
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Database Migration**:
   Run the SQL migration in `care_reminders_migration.sql` to add the new columns.

4. **Start the Service**:
   ```bash
   node server.js
   ```

## Cron Job

The service includes a cron job that runs every 5 minutes to automatically check for due reminders:

```javascript
cron.schedule(
  "*/5 * * * *",
  async () => {
    // Check and send due reminders
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);
```

## Logging

All notification activities are logged to the `notification_logs` table in Supabase, including:

- Notification type (all, specific, reminders)
- Title and body
- Recipient count
- Timestamp
- Additional data

## Error Handling

- Database connection errors are logged and handled gracefully
- Failed notification sends are logged but don't stop the process
- Invalid reminder data is filtered out
- Missing users are handled without breaking the notification flow
