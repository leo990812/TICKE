require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, roleMention, userMention } = require("discord.js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔹 取得機器人已加入伺服器
app.get("/api/bot/guilds", (req, res) => {
    try {
        const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        res.json(guilds);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "無法取得機器人伺服器" });
    }
});

// 🔹 取得伺服器頻道與角色
app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });

    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));

    const everyoneRoleIndex = roles.findIndex(r => r.name === "@everyone");
    if (everyoneRoleIndex !== -1) roles[everyoneRoleIndex].name = "@everyone";

    res.json({ channels, roles });
});

// 🔹 更新伺服器設定並發送票口按鈕
app.post("/api/servers/:id/settings", async (req, res) => {
    settingsDB[req.params.id] = req.body;

    const guild = client.guilds.cache.get(req.params.id);
    if (guild) {
        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (channel) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(req.body.buttonText || "🎫 開啟工單")
                    .setStyle(ButtonStyle.Primary)
            );

            // 處理 PING 角色
            let pingText = "";
            if (req.body.notifyRole) {
                if (req.body.notifyRole === "@everyone") pingText = "@everyone";
                else pingText = roleMention(req.body.notifyRole);
            }

            // 使用者完全自訂訊息
            const customMessage = req.body.messageContent || `${pingText}\n**自創工單機器人**\n用途：提交建議、提出疑問\n⚠️ 若遇問題請聯繫 ${userMention(process.env.ADMIN_USER_ID)}`;

            await channel.send({
                content: customMessage,
                components: [row]
            });
        }
    }

    res.json({ success: true });
});

app.get("/", (req, res) => res.send("✅ Bot 控制面板運行中"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
