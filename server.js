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

            // === 按鈕上方訊息（跟工單歡迎訊息完全一致） ===
            // 可直接換行，保留排版
            const topText = req.body.topText?.trim() || 
`📢 **檢舉系統** 📢

若您發現任何成員有 **脫序行為** 或 **違反社群規範**，
請透過下方按鈕開啟工單並填寫檢舉內容。

🔖 **請依以下格式提供完整資訊：**

* **檢舉人：**
* **被檢舉人：**
* **事由：**
* **證據：**
* **備註：** (非必要)

為確保處理效率，請務必附上清楚的證據（如截圖、訊息連結）。
本社群將依規範進行審核與處置，感謝您的配合與協助。`;

            // 如果有要 @ 管理角色或 @ 使用者，也放在最上方
            const userMention = req.body.pingUser ? `<@${req.body.pingUser}>\n` : "";
            const supportMention = req.body.notifyRole ? `<@&${req.body.notifyRole}>\n` : "";

            await channel.send({
                content: `${userMention}${topText}${supportMention}`,
                components: [row]
            });
        }
    }

    res.json({ success: true });
});

// 基本頁面
app.get("/", (req, res) => res.send("Bot 控制面板在線"));

app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server started"));
