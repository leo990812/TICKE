// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot"); 
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 取得機器人已加入伺服器
app.get("/api/bot/guilds", (req, res) => {
    try {
        const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        res.json(guilds);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "無法取得機器人伺服器" });
    }
});

// 伺服器頻道與角色資訊
app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });

    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));

    // 確保 @everyone 只出現一次
    const everyoneRoleIndex = roles.findIndex(r => r.name === "@everyone");
    if (everyoneRoleIndex !== -1) roles[everyoneRoleIndex].name = "@everyone";

    res.json({ channels, roles });
});

// 更新伺服器設定並發送按鈕訊息
app.post("/api/servers/:id/settings", async (req, res) => {
    settingsDB[req.params.id] = req.body;
    const guild = client.guilds.cache.get(req.params.id);

    if (guild) {
        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (channel) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, roleMention, userMention } = require("discord.js");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(req.body.buttonText || "🎫 開啟工單")
                    .setStyle(ButtonStyle.Primary)
            );

            // ping 角色，但 @everyone 保持單一
            let pingText = "";
            if (req.body.notifyRole) {
                if (req.body.notifyRole === "@everyone") pingText = "@everyone";
                else pingText = roleMention(req.body.notifyRole);
            }

            await channel.send({
                content: `${pingText}\n${req.body.messageContent || "**自創工單機器人**\n用途：提交建議、提出疑問"}\n⚠️ 若遇問題請聯繫 ${userMention(process.env.ADMIN_USER_ID)}`,
                components: [row]
            });
        }
    }

    res.json({ success: true });
});

// 基本頁面
app.get("/", (req, res) => res.send("Bot 控制面板在線"));

app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
