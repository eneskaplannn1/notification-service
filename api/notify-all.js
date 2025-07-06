const { Expo } = require("expo-server-sdk");
const { supabase } = require("../supabase");

const expo = new Expo();

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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
};
