const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Expo } = require("expo-server-sdk");
const cron = require("node-cron");
const axios = require("axios");
const { supabase } = require("./supabase");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const expo = new Expo();

// Configure CORS for mobile development
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:8081",
      "http://localhost:19006",
      "exp://localhost:19000",
      "http://172.20.10.14:3000",
      "http://172.20.10.14:8081",
      "http://172.20.10.14:19006",
      "exp://172.20.10.14:19000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Notification service is running" });
});

app.post("/notify/all", async (req, res) => {
  try {
    const { title, body, data = {} } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: "Title and body are required" });
    }

    const { data: users, error: usersError } = await supabase
      .from("notification_users")
      .select("user_id, push_token");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    if (!users || users.length === 0) {
      return res.status(404).json({ error: "No registered users found" });
    }

    const messages = users.map((user) => ({
      to: user.push_token,
      sound: "default",
      title,
      body,
      data: { ...data, userId: user.user_id },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("Error sending chunk:", error);
      }
    }

    const { error: logError } = await supabase
      .from("notification_logs")
      .insert([
        {
          type: "all",
          title,
          body,
          data: JSON.stringify(data),
          sent_at: new Date().toISOString(),
          recipients: users.length,
        },
      ]);

    if (logError) {
      console.error("Error logging notification:", logError);
    }

    console.log(`Notification sent to ${users.length} users`);
    res.json({
      success: true,
      message: `Notification sent to ${users.length} users`,
      tickets,
    });
  } catch (error) {
    console.error("Notification error:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.post("/notify/users", async (req, res) => {
  try {
    const { userIds, title, body, data = {} } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "User IDs array is required" });
    }

    if (!title || !body) {
      return res.status(400).json({ error: "Title and body are required" });
    }

    // Get specific users from Supabase
    const { data: targetUsers, error: usersError } = await supabase
      .from("notification_users")
      .select("user_id, push_token")
      .in("user_id", userIds);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    if (!targetUsers || targetUsers.length === 0) {
      return res
        .status(404)
        .json({ error: "No users found with provided IDs" });
    }

    const messages = targetUsers.map((user) => ({
      to: user.push_token,
      sound: "default",
      title,
      body,
      data: { ...data, userId: user.user_id },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("Error sending chunk:", error);
      }
    }

    // Log notification to Supabase
    const { error: logError } = await supabase
      .from("notification_logs")
      .insert([
        {
          type: "specific",
          title,
          body,
          data: JSON.stringify(data),
          sent_at: new Date().toISOString(),
          recipients: targetUsers.length,
          user_ids: userIds,
        },
      ]);

    if (logError) {
      console.error("Error logging notification:", logError);
    }

    console.log(`Notification sent to ${targetUsers.length} specific users`);
    res.json({
      success: true,
      message: `Notification sent to ${targetUsers.length} users`,
      tickets,
    });
  } catch (error) {
    console.error("Notification error:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// Helper function to check if a reminder should be sent based on frequency and last notification
function shouldSendReminder(reminder) {
  const now = new Date();
  const reminderTime = new Date(reminder.reminder_time);
  const lastNotificationSent = reminder.last_notification_sent
    ? new Date(reminder.last_notification_sent)
    : null;

  // If it's a one-time reminder and has already been sent, don't send again
  if (reminder.frequency === "once" && lastNotificationSent) {
    return false;
  }

  // For recurring reminders, check if enough time has passed since last notification
  if (lastNotificationSent) {
    const timeSinceLastNotification =
      now.getTime() - lastNotificationSent.getTime();
    const daysSinceLastNotification =
      timeSinceLastNotification / (1000 * 60 * 60 * 24);

    switch (reminder.frequency) {
      case "daily":
        return daysSinceLastNotification >= 1;
      case "weekly":
        return daysSinceLastNotification >= 7;
      case "biweekly":
        return daysSinceLastNotification >= 14;
      case "monthly":
        return daysSinceLastNotification >= 30;
      default:
        return false;
    }
  }

  // If no notification has been sent yet, check if the reminder time has passed
  return reminderTime <= now;
}

// Helper function to calculate next reminder time based on frequency
function calculateNextReminderTime(reminder) {
  const now = new Date();
  const baseTime = new Date(reminder.reminder_time);

  // Keep the same time of day, just update the date
  const nextTime = new Date(now);
  nextTime.setHours(baseTime.getHours());
  nextTime.setMinutes(baseTime.getMinutes());
  nextTime.setSeconds(0);
  nextTime.setMilliseconds(0);

  switch (reminder.frequency) {
    case "daily":
      nextTime.setDate(nextTime.getDate() + 1);
      break;
    case "weekly":
      nextTime.setDate(nextTime.getDate() + 7);
      break;
    case "biweekly":
      nextTime.setDate(nextTime.getDate() + 14);
      break;
    case "monthly":
      nextTime.setMonth(nextTime.getMonth() + 1);
      break;
    default:
      return null; // No next time for one-time reminders
  }

  return nextTime;
}

app.post("/notify/reminders", async (req, res) => {
  try {
    // Fetch all care reminders from the database
    const { data: reminders, error: remindersError } = await supabase
      .from("care_reminders")
      .select("*");

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return res.status(500).json({ error: "Failed to fetch reminders" });
    }

    if (!reminders || reminders.length === 0) {
      return res.status(404).json({ error: "No reminders found" });
    }

    // Filter reminders that should be sent
    const remindersToSend = reminders.filter(shouldSendReminder);

    if (remindersToSend.length === 0) {
      return res.json({
        success: true,
        message: "No reminders due for notification",
        sent: 0,
      });
    }

    // Get unique user plant IDs from reminders to send
    const userPlantIds = [
      ...new Set(remindersToSend.map((r) => r.user_plant_id)),
    ];

    // Fetch user plants with user_id and plant nicknames
    const { data: userPlants, error: userPlantsError } = await supabase
      .from("user_plants")
      .select(
        `
        id,
        user_id,
        plant_id,
        nickname
      `
      )
      .in("id", userPlantIds);

    if (userPlantsError) {
      console.error("Error fetching user plants:", userPlantsError);
      return res.status(500).json({ error: "Failed to fetch user plants" });
    }

    // Create a map for quick lookup
    const userPlantMap = new Map();
    userPlants.forEach((up) => {
      userPlantMap.set(up.id, up);
    });

    // Get unique user IDs from user plants
    const userIds = [...new Set(userPlants.map((up) => up.user_id))];

    // Get users from Supabase
    const { data: users, error: usersError } = await supabase
      .from("notification_users")
      .select("user_id, push_token")
      .in("user_id", userIds);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    const messages = [];
    const reminderUpdates = [];

    for (const reminder of remindersToSend) {
      const userPlant = userPlantMap.get(reminder.user_plant_id);
      if (!userPlant) {
        console.log(`User plant not found for reminder ${reminder.id}`);
        continue;
      }

      const user = users.find((u) => u.user_id === userPlant.user_id);
      if (user) {
        messages.push({
          to: user.push_token,
          sound: "default",
          title: "🌱 Plant Care Reminder",
          body:
            reminder.message ||
            `Time to ${reminder.reminder_type} your ${
              userPlant.nickname || "plant"
            }!`,
          data: {
            type: "reminder",
            reminderId: reminder.id,
            plantId: reminder.user_plant_id,
            userId: user.user_id,
            uri: "/plants/" + reminder.user_plant_id,
          },
        });

        // Prepare update for last_notification_sent
        const updateData = {
          id: reminder.id,
          last_notification_sent: new Date().toISOString(),
        };

        // For recurring reminders, update the next reminder time
        if (reminder.frequency !== "once") {
          const nextTime = calculateNextReminderTime(reminder);
          if (nextTime) {
            updateData.reminder_time = nextTime.toISOString();
          }
        }

        reminderUpdates.push(updateData);
      }
    }

    if (messages.length === 0) {
      return res
        .status(404)
        .json({ error: "No valid users found for reminders" });
    }

    // Send notifications
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("Error sending reminder chunk:", error);
      }
    }

    // Update reminder records with last_notification_sent and next reminder time
    for (const update of reminderUpdates) {
      const { error: updateError } = await supabase
        .from("care_reminders")
        .update({
          last_notification_sent: update.last_notification_sent,
          ...(update.reminder_time && { reminder_time: update.reminder_time }),
        })
        .eq("id", update.id);

      if (updateError) {
        console.error("Error updating reminder:", updateError);
      }
    }

    // Log notification to Supabase
    const { error: logError } = await supabase
      .from("notification_logs")
      .insert([
        {
          type: "reminders",
          title: "Plant Care Reminders",
          body: `Sent ${messages.length} reminder notifications`,
          sent_at: new Date().toISOString(),
          recipients: messages.length,
          data: JSON.stringify({
            reminders: remindersToSend.map((r) => ({
              id: r.id,
              type: r.reminder_type,
              frequency: r.frequency,
            })),
          }),
        },
      ]);

    if (logError) {
      console.error("Error logging notification:", logError);
    }

    console.log(`Reminder notifications sent to ${messages.length} users`);
    res.json({
      success: true,
      message: `Reminder notifications sent to ${messages.length} users`,
      tickets,
      sent: messages.length,
    });
  } catch (error) {
    console.error("Reminder notification error:", error);
    res.status(500).json({ error: "Failed to send reminder notifications" });
  }
});

// User account deletion endpoint
app.delete("/users/:userId", async (req, res) => {
  console.log("Deleting user account:", req.params);
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    console.log(`Attempting to delete user account: ${userId}`);

    // Delete user data from all related tables first
    const { error: userPlantsError } = await supabase
      .from("user_plants")
      .delete()
      .eq("user_id", userId);

    if (userPlantsError) {
      console.error("Error deleting user plants:", userPlantsError);
    }

    // Delete feature requests
    const { error: featureRequestsError } = await supabase
      .from("feature_requests")
      .delete()
      .eq("user_id", userId);

    if (featureRequestsError) {
      console.error("Error deleting feature requests:", featureRequestsError);
    }

    // Delete feature request votes
    const { error: votesError } = await supabase
      .from("feature_request_votes")
      .delete()
      .eq("user_id", userId);

    if (votesError) {
      console.error("Error deleting feature request votes:", votesError);
    }

    // Delete care reminders - need to delete through user_plants relationship
    // First get all user plant IDs for this user
    const { data: userPlantIds, error: userPlantsQueryError } = await supabase
      .from("user_plants")
      .select("id")
      .eq("user_id", userId);

    if (userPlantsQueryError) {
      console.error("Error fetching user plant IDs:", userPlantsQueryError);
    } else if (userPlantIds && userPlantIds.length > 0) {
      const plantIds = userPlantIds.map((plant) => plant.id);
      const { error: remindersError } = await supabase
        .from("care_reminders")
        .delete()
        .in("user_plant_id", plantIds);

      if (remindersError) {
        console.error("Error deleting care reminders:", remindersError);
      }
    }

    // Delete weather alerts
    const { error: weatherAlertsError } = await supabase
      .from("weather_alerts")
      .delete()
      .eq("user_id", userId);

    if (weatherAlertsError) {
      console.error("Error deleting weather alerts:", weatherAlertsError);
    }

    // Delete notification users
    const { error: notificationUsersError } = await supabase
      .from("notification_users")
      .delete()
      .eq("user_id", userId);

    if (notificationUsersError) {
      console.error(
        "Error deleting notification users:",
        notificationUsersError
      );
    }

    // Delete the auth user using admin privileges
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);

    if (authError) {
      console.error("Error deleting auth user:", authError);
      return res.status(500).json({
        error: "Failed to delete user account",
        details: authError.message,
      });
    }

    console.log(`Successfully deleted user account: ${userId}`);
    res.json({
      success: true,
      message: "User account deleted successfully",
    });
  } catch (error) {
    console.error("User deletion error:", error);
    res.status(500).json({
      error: "Failed to delete user account",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Notification server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

cron.schedule(
  "*/5 * * * *",
  async () => {
    console.log("Running scheduled reminder check...");

    try {
      // Make a request to our own endpoint to process reminders
      const response = await axios.post(
        `http://localhost:${PORT}/notify/reminders`
      );
      console.log("Scheduled reminder check completed:", response.data);
    } catch (error) {
      console.error("Error in scheduled reminder check:", error.message);
    }
  },
  {
    scheduled: true,
    timezone: "UTC",
  }
);

console.log("Scheduled reminder check every 5 minutes");

module.exports = app;
