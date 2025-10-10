require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const settingsDB = require("./settingsDB");
const bot = require("./bot"); // 確保 bot.js 被引用

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// 獲取伺服器設定
app.get("/api/servers/:id", (req, res) => {
    res.json(settingsDB[req.params.id] || {});
});

// 更新伺服器設定
app.post("/api/servers/:id/settings", (req, res) => {
    settingsDB[req.params.id] = req.body;

    // 儲存後自動發送按鈕
    const guild = bot.client.guilds.cache.get(req.params.id);
    if (guild) {
        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (channel) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, roleMention, userMention } = require("discord.js");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("create_ticket").setLabel("🎫 開啟工單").setStyle(ButtonStyle.Primary)
            );
            channel.send({
                content: `📢 ${roleMention(req.body.notifyRole)}\n**自創工單機器人**\n用途：提交建議、提出疑問\n⚠️ 若遇問題請聯繫 ${userMention(process.env.ADMIN_USER_ID)}`,
                components: [row]
            });
        }
    }

    res.json({ success: true });
});

app.get("/", (req, res) => res.send("Bot 控制面板在線"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
