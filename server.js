require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, roleMention, userMention } = require("discord.js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// === 取得機器人伺服器 ===
app.get("/api/bot/guilds", (req, res) => {
  try {
    const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
    res.json(guilds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "無法取得機器人伺服器" });
  }
});

// === 取得伺服器資料 ===
app.get("/api/servers/:id/info", (req, res) => {
  const guild = client.guilds.cache.get(req.params.id);
  if (!guild) return res.json({ channels: [], roles: [] });

  const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
  const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));
  const everyoneRoleIndex = roles.findIndex(r => r.name === "@everyone");
  if (everyoneRoleIndex !== -1) roles[everyoneRoleIndex].name = "@everyone";

  res.json({ channels, roles });
});

// === 發送按鈕訊息 ===
app.post("/api/servers/:id/settings", async (req, res) => {
  try {
    const config = req.body;
    settingsDB[req.params.id] = config;

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: "找不到該伺服器" });

    const channel = guild.channels.cache.get(config.ticketChannel);
    if (!channel) return res.status(404).json({ error: "找不到設定的頻道" });

    // 按鈕
    const buttonText = config.buttonText?.trim() || "🎫 開啟工單";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel(buttonText)
        .setStyle(ButtonStyle.Primary)
    );

    // PING角色
    let pingText = "";
    if (config.notifyRole) {
      if (config.notifyRole === "@everyone") pingText = "@everyone";
      else if (config.notifyRole.startsWith("<@&")) pingText = config.notifyRole;
      else pingText = roleMention(config.notifyRole);
    }

    // 上方文字（清理空白與換行）
    let customMessage = (config.messageContent || "").trim();
    if (!customMessage) {
      customMessage = `${pingText}\n**自創工單機器人**\n用途：提交建議、提出疑問\n⚠️ 若遇問題請聯繫 ${userMention(process.env.ADMIN_USER_ID)}`;
    } else {
      if (pingText && !customMessage.includes(pingText))
        customMessage = `${pingText}\n${customMessage}`;
    }

    // 避免開頭換行、長度過長
    customMessage = customMessage.replace(/^\n+/, "");
    if (customMessage.length > 1990) customMessage = customMessage.slice(0, 1990) + "…";

    // Discord 必須有 content 或 embed 才能發送 components
    if (!customMessage || customMessage.length === 0)
      customMessage = "🎫 開啟工單";

    await channel.send({
      content: customMessage,
      components: [row]
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Discord 傳送訊息錯誤:", err);
    return res.status(500).json({ error: err.message || "無法發送訊息" });
  }
});

app.get("/", (req, res) => res.send("✅ Bot 控制面板運行中"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
