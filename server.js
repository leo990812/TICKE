require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot"); // 確保這行能抓到 client
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 取得機器人伺服器列表
app.get("/api/bot/guilds", (req, res) => {
    try {
        const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        res.json(guilds);
    } catch (e) {
        res.status(500).json({ error: "機器人尚未就緒" });
    }
});

// 伺服器資訊
app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });

    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));

    res.json({ channels, roles });
});

// 更新設定並發送票口
app.post("/api/servers/:id/settings", async (req, res) => {
    try {
        const serverId = req.params.id;
        const guild = client.guilds.cache.get(serverId);
        if (!guild) return res.status(404).json({ error: "找不到該伺服器" });

        // 存入持久化資料庫
        settingsDB[serverId] = req.body;

        const config = req.body;
        const channel = guild.channels.cache.get(config.ticketChannel);
        if (!channel) return res.status(404).json({ error: "找不到指定的頻道" });

        // 建立按鈕
        const btnLabel = (config.buttonText || "🎫 開啟工單").slice(0, 80);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel(btnLabel)
                .setStyle(ButtonStyle.Primary)
        );

        // 處理內文
        let content = "";
        if (config.pingRole && config.notifyRole) {
            content += `<@&${config.notifyRole}>\n`;
        }
        content += config.topText || "📬 點擊下方按鈕以開啟私人工單";

        await channel.send({ content: content, components: [row] });
        res.json({ success: true });
    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 控制面板運行於 http://localhost:${PORT}`));
