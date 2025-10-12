// server.js
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
        // 將前端送來的設定存入 settingsDB（包含 welcomeMessage/topText/buttonText 等）
        settingsDB[req.params.id] = req.body;

        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: "找不到該伺服器" });

        const channel = guild.channels.cache.get(req.body.ticketChannel);
        if (!channel) return res.status(404).json({ error: "找不到設定的頻道" });

        // 建按鈕
        const buttonText = (req.body.buttonText || "🎫 開啟工單").toString().slice(0, 80);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel(buttonText)
                .setStyle(ButtonStyle.Primary)
        );

        // topText（按鈕上方內文） 與 welcomeMessage（開啟工單後訊息）儲存在 settingsDB
        const topText = (req.body.topText || "").toString().trim();
        const welcomeMessage = (req.body.welcomeMessage || "").toString().trim();

        // 若有 notifyRole（想要 ping 的角色），組成 mention
        const supportMention = req.body.supportRole ? `<@&${req.body.supportRole}>\n` : "";

        // 若前端有想要先 mention 某使用者（通常不需要），支援 pingUser
        const userMention = req.body.pingUser ? `<@${req.body.pingUser}>\n` : "";

        // messageToSend：順序 userMention (可選) -> topText（若有） or default topText -> supportMention (可選)
        // 我把 topText 放中間（按鈕上方內文），並保留換行格式
        let messageToSend = "";
        if (userMention) messageToSend += userMention;
        if (topText) {
            messageToSend += `${topText}\n`;
        } else {
            // 若沒提供 topText，放一個簡短預設提示
            messageToSend += `**自創工單機器人**\n用途：提交建議、提出疑問\n`;
        }
        if (supportMention) messageToSend += supportMention;

        // 最多 2000 字
        if (messageToSend.length > 2000) messageToSend = messageToSend.slice(0, 1990) + "…";

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
