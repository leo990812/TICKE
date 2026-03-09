require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/servers/:id/settings", async (req, res) => {
    try {
        const guildId = req.params.id;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: "找不到伺服器" });

        // 保存設定
        settingsDB[guildId] = req.body;

        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (!channel) return res.status(404).json({ error: "找不到按鈕發送頻道" });

        const buttonText = (req.body.buttonText || "🎫 開啟工單").toString().slice(0, 80);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("create_ticket").setLabel(buttonText).setStyle(ButtonStyle.Primary)
        );

        // --- 強制判定 Ping 邏輯 ---
        let finalMessage = "";
        const pingEnabled = String(req.body.pingRole) === "true"; // 強制轉字串判斷
        
        if (pingEnabled && req.body.notifyRole) {
            finalMessage += `<@&${req.body.notifyRole}>\n`;
        }
        finalMessage += (req.body.topText || "📬 點擊按鈕開啟工單");

        await channel.send({ content: finalMessage, components: [row] });
        res.json({ success: true });
    } catch (err) {
        console.error("發送錯誤:", err);
        res.status(500).json({ error: "發送失敗" });
    }
});

app.get("/api/bot/guilds", (req, res) => {
    try {
        const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        res.json(guilds);
    } catch { res.status(500).json({ error: "Bot未就緒" }); }
});

app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });
    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));
    res.json({ channels, roles });
});

app.listen(process.env.PORT || 3000);
