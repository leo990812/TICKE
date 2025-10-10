// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const settingsDB = require("./settingsDB");
const client = require("./bot"); // 導入 bot.js 的 client
const fetch = require("node-fetch"); // 如果還沒安裝請 npm install node-fetch

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------
// 1️⃣ 新增 API：機器人已加入伺服器
// ---------------------------
app.get("/api/bot/guilds", async (req, res) => {
    try {
        // 用機器人 token 呼叫 Discord API 取得機器人已加入的伺服器
        const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
            headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
        });
        const guilds = await response.json();

        // 只回傳 id 和 name
        const simplified = guilds.map(g => ({ id: g.id, name: g.name }));
        res.json(simplified);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "無法取得機器人伺服器" });
    }
});

// ---------------------------
// 2️⃣ 現有 API：伺服器頻道與角色資訊
// ---------------------------
app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });

    const channels = guild.channels.cache.filter(c => c.type === 0) // 文字頻道
        .map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));

    res.json({ channels, roles });
});

// ---------------------------
// 3️⃣ 更新伺服器設定
// ---------------------------
app.post("/api/servers/:id/settings", async (req, res) => {
    settingsDB[req.params.id] = req.body;

    const guild = client.guilds.cache.get(req.params.id);
    if (guild) {
        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (channel) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, roleMention, userMention } = require("discord.js");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("create_ticket").setLabel("🎫 開啟工單").setStyle(ButtonStyle.Primary)
            );

            await channel.send({
                content: `📢 ${roleMention(req.body.notifyRole)}\n**自創工單機器人**\n用途：提交建議、提出疑問\n⚠️ 若遇問題請聯繫 ${userMention(process.env.ADMIN_USER_ID)}`,
                components: [row]
            });
        }
    }

    res.json({ success: true });
});

app.get("/", (req, res) => res.send("Bot 控制面板在線"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
