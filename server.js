require("dotenv").config();
const express = require("express");
const path = require("path");
const settingsDB = require("./settingsDB");
const client = require("./bot");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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

    const everyoneRoleIndex = roles.findIndex(r => r.name === "@everyone");
    if (everyoneRoleIndex !== -1) roles[everyoneRoleIndex].name = "@everyone";

    res.json({ channels, roles });
});

// 更新伺服器設定並發送按鈕訊息
app.post("/api/servers/:id/settings", async (req, res) => {
    try {
        // 存設定
        settingsDB[req.params.id] = req.body;

        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: "找不到該伺服器" });

        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (!channel) return res.status(404).json({ error: "找不到設定的頻道" });

        const buttonText = (req.body.buttonText || "🎫 開啟工單").toString().slice(0, 80);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel(buttonText)
                .setStyle(ButtonStyle.Primary)
        );

        const topText = (req.body.topText || "").toString().trim();

        // ✅ 控制面板設定
        const shouldPingNotify = req.body.shouldPingNotify === true;
        const notifyRoleId = req.body.notifyRole;

        let messageToSend = "";

        // ✅ 若有勾選並選擇角色 → mention
        if (shouldPingNotify && notifyRoleId) {
            messageToSend += `<@&${notifyRoleId}>\n`;
        }

        // ✅ 顯示按鈕上方文字（可多行）
        if (topText) {
            messageToSend += `${topText}`;
        } else {
            messageToSend += `📌 **票口使用說明**\n本票口供社群成員使用，適用於活動、私人溝通、或遇到任何困難。`;
        }

        await channel.send({
            content: messageToSend,
            components: [row]
        });

        return res.json({ success: true });
    } catch (err) {
        console.error("❌ 發送票口訊息錯誤:", err);
        return res.status(500).json({ error: "無法發送訊息，請檢查伺服器設定或權限。" });
    }
});

// 基本頁面
app.get("/", (req, res) => res.send("Bot 控制面板在線"));

app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
