require("dotenv").config();
const express = require("express");
const path = require("path");
const client = require("./bot");
const settingsDB = require("./settingsDB");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 取得機器人所在的伺服器列表
app.get("/api/bot/guilds", (req, res) => {
    try {
        const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
        res.json(guilds);
    } catch (e) {
        res.status(500).json({ error: "機器人尚未連線" });
    }
});

// 取得特定伺服器的頻道與角色
app.get("/api/servers/:id/info", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.json({ channels: [], roles: [] });

    const channels = guild.channels.cache
        .filter(c => c.type === 0)
        .map(c => ({ id: c.id, name: c.name }));
    
    const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));
    
    res.json({ channels, roles });
});

// 儲存設定並發送票口訊息
app.post("/api/servers/:id/settings", async (req, res) => {
    try {
        const guildId = req.params.id;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: "找不到伺服器" });

        // 更新數據庫
        settingsDB[guildId] = req.body;

        const config = req.body;
        const channel = guild.channels.cache.get(config.ticketChannel);
        if (!channel) return res.status(404).json({ error: "找不到指定的頻道" });

        // 建立按鈕組件
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel(config.buttonText || "🎫 開啟工單")
                .setStyle(ButtonStyle.Primary)
        );

        // 組合內容
        let content = "";
        if (config.pingRole && config.notifyRole) {
            content += `<@&${config.notifyRole}>\n`;
        }
        content += config.topText || "📬 點擊下方按鈕以開啟工單";

        await channel.send({ content, components: [row] });
        res.json({ success: true });
    } catch (err) {
        console.error("發送失敗:", err);
        res.status(500).json({ error: "無法發送訊息，請檢查機器人權限" });
    }
});

// 讓 Render 保持喚醒的根路徑
app.get("/", (req, res) => res.send("工單機器人控制面板運行中"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 伺服器已啟動：http://localhost:${PORT}`));
