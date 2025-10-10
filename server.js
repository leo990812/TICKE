const express = require("express");
const session = require("express-session");
const axios = require("axios");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);

// Discord OAuth2 登入
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

app.get("/login", (req, res) => {
  res.redirect(
    `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code&scope=identify%20guilds`
  );
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    req.session.access_token = tokenRes.data.access_token;

    res.redirect("/panel");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send("登入失敗");
  }
});

app.get("/panel", async (req, res) => {
  if (!req.session.access_token) return res.redirect("/login");

  try {
    // 抓使用者伺服器
    const guildRes = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${req.session.access_token}` },
    });

    // 抓機器人已加入的伺服器
    const botGuilds = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    const userGuilds = guildRes.data;
    const botGuildList = botGuilds.data;

    // 過濾：只顯示機器人已加入的伺服器
    const filteredGuilds = userGuilds.filter((g) =>
      botGuildList.some((bg) => bg.id === g.id)
    );

    res.sendFile(path.join(__dirname, "panel.html"));
    req.session.guilds = filteredGuilds;
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send("載入失敗");
  }
});

// 提交表單 → 發送 webhook
app.post("/send", async (req, res) => {
  const { webhookUrl, message, buttonText, allowPing } = req.body;

  try {
    await axios.post(webhookUrl, {
      content: message,
      allowed_mentions: allowPing === "true"
        ? { parse: ["roles", "users", "everyone"] }
        : { parse: [] },
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: buttonText || "按鈕",
              custom_id: "custom_button",
            },
          ],
        },
      ],
    });

    res.send("✅ 發送成功！");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send("❌ 發送失敗");
  }
});

app.listen(3000, () => console.log("✅ 後端已啟動 http://localhost:3000"));

