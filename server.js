require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 取得機器人伺服器列表
app.get("/api/bot/guilds", (req, res) => {
    try {
        const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        res.json(guilds);
    } catch {
        res.status(500).json({ error: "無法取得伺服器列表" });
    }
});

// 伺服器資訊（頻道與角色）
app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });

    // 過濾出文字頻道 (type 0)
    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));

    res.json({ channels, roles });
});

// 更新設定並發送票口訊息
app.post("/api/servers/:id/settings", async (req, res) => {
    try {
        const guildId = req.params.id;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: "找不到伺服器" });

        // 儲存到 settingsDB (Proxy 會自動存入 JSON)
        settingsDB[guildId] = req.body;

        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (!channel) return res.status(404).json({ error: "找不到頻道" });

        const buttonText = (req.body.buttonText || "🎫 開啟工單").toString().slice(0, 80);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("create_ticket").setLabel(buttonText).setStyle(ButtonStyle.Primary)
        );

        const topText = (req.body.topText || "").trim();
        const notifyRoleId = req.body.notifyRole;
        const shouldPingNotify = !!req.body.pingRole;

        let message = "";
        if (shouldPingNotify && notifyRoleId) message += `<@&${notifyRoleId}>\n`;
        message += topText || "📬 點擊下方按鈕以開啟私人工單";

        await channel.send({ content: message, components: [row] });
        return res.json({ success: true });
    } catch (err) {
        console.error("❌ 發送票口訊息錯誤:", err);
        res.status(500).json({ error: "無法發送訊息" });
    }
});

app.get("/", (req, res) => res.send("Bot 控制面板在線"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server started on port ${PORT}`));
