const { Expo } = require("expo-server-sdk");
const { supabase } = require("../supabase");

const expo = new Expo();

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

  // For first-time reminders, check if the reminder time has passed
  if (!lastNotificationSent) {
    return now >= reminderTime;
  }

  // For recurring reminders, check if enough time has passed since last notification
  const timeSinceLastNotification = now - lastNotificationSent;
  const frequencyInMs = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    biweekly: 14 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const requiredInterval = frequencyInMs[reminder.frequency];
  if (!requiredInterval) {
    return false;
  }

  return timeSinceLastNotification >= requiredInterval;
}

// Helper function to calculate next reminder time for recurring reminders
function calculateNextReminderTime(reminder) {
  const now = new Date();
  const originalTime = new Date(reminder.reminder_time);

  // Keep the same time of day as the original reminder
  const hours = originalTime.getHours();
  const minutes = originalTime.getMinutes();
  const seconds = originalTime.getSeconds();

  let nextTime = new Date(now);
  nextTime.setHours(hours, minutes, seconds, 0);

  // If the calculated time is in the past, add the frequency interval
  if (nextTime <= now) {
    const frequencyInMs = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      biweekly: 14 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };

    const interval = frequencyInMs[reminder.frequency];
    if (interval) {
      nextTime = new Date(nextTime.getTime() + interval);
    }
  }

  return nextTime;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Allow both GET and POST for cron triggers
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Fetch all reminders from the database
    const { data: reminders, error: remindersError } = await supabase.from(
      "care_reminders"
    ).select(`
        *,
        user_plants!inner(
          user_id,
          users!inner(
            notification_users!inner(
              push_token
            )
          )
        )
      `);

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return res.status(500).json({ error: "Failed to fetch reminders" });
    }

    if (!reminders || reminders.length === 0) {
      return res.json({
        success: true,
        message: "No reminders found",
        sent: 0,
        tickets: [],
        timestamp: new Date().toISOString(),
      });
    }

    const messages = [];
    const remindersToUpdate = [];

    // Process each reminder
    for (const reminder of reminders) {
      if (!shouldSendReminder(reminder)) {
        continue;
      }

      const userPlant = reminder.user_plants;
      if (
        !userPlant ||
        !userPlant.users ||
        !userPlant.users.notification_users
      ) {
        continue;
      }

      const pushToken = userPlant.users.notification_users.push_token;
      if (!pushToken) {
        continue;
      }

      // Create notification message
      messages.push({
        to: pushToken,
        sound: "default",
        title: "Plant Care Reminder",
        body:
          reminder.message || `Time to ${reminder.reminder_type} your plant!`,
        data: {
          reminderId: reminder.id,
          userPlantId: reminder.user_plant_id,
          reminderType: reminder.reminder_type,
          userId: userPlant.user_id,
        },
      });

      // Mark reminder for update
      remindersToUpdate.push({
        id: reminder.id,
        last_notification_sent: new Date().toISOString(),
        reminder_time: calculateNextReminderTime(reminder).toISOString(),
      });
    }

    if (messages.length === 0) {
      return res.json({
        success: true,
        message: "No due reminders found",
        sent: 0,
        tickets: [],
        timestamp: new Date().toISOString(),
      });
    }

    // Send notifications
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

    // Update reminders in database
    for (const reminderUpdate of remindersToUpdate) {
      const { error: updateError } = await supabase
        .from("care_reminders")
        .update({
          last_notification_sent: reminderUpdate.last_notification_sent,
          reminder_time: reminderUpdate.reminder_time,
        })
        .eq("id", reminderUpdate.id);

      if (updateError) {
        console.error("Error updating reminder:", updateError);
      }
    }

    // Log notification activity
    const { error: logError } = await supabase
      .from("notification_logs")
      .insert([
        {
          type: "cron_reminders",
          title: "Plant Care Reminders (Cron)",
          body: `Sent ${messages.length} reminder notifications via cron`,
          data: JSON.stringify({ sent: messages.length }),
          sent_at: new Date().toISOString(),
          recipients: messages.length,
        },
      ]);

    if (logError) {
      console.error("Error logging notification:", logError);
    }

    console.log(
      `Cron: Reminder notifications sent to ${messages.length} users`
    );
    res.json({
      success: true,
      message: `Reminder notifications sent to ${messages.length} users`,
      tickets,
      sent: messages.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron reminder notification error:", error);
    res.status(500).json({ error: "Failed to process reminders" });
  }
};
