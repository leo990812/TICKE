require("dotenv").config();
const {
    Client, GatewayIntentBits, Partials,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, AttachmentBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
let settingsDB = require("./settingsDB");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // 儲存紀錄必備
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

const TICKET_CATEGORY_NAME = "🎫票口 Ticket";

// 自動存檔功能
function saveSettings() {
    const filePath = path.join(__dirname, "settingsDB.js");
    const content = `module.exports = ${JSON.stringify(settingsDB, null, 4)};`;
    fs.writeFileSync(filePath, content, "utf8");
}

function ensureServerConfig(guildId) {
    if (!settingsDB[guildId]) {
        settingsDB[guildId] = {
            notifyRole: null,
            supportRole: null,
            ticketChannel: null,
            logChannel: null,
            welcomeMessage: "📩 歡迎！請描述你的問題"
        };
        saveSettings();
    }
    return settingsDB[guildId];
}

async function fetchAllMessages(channel) {
    let messages = [];
    let lastId;
    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) break;
        messages = messages.concat(Array.from(fetched.values()));
        if (fetched.size !== 100) break;
        lastId = fetched.last()?.id;
    }
    return messages.reverse();
}

client.once("ready", () => {
    console.log(`✅ Bot 已登入 ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const guildId = interaction.guild.id;
    const config = ensureServerConfig(guildId);

    // 建立票口
    if (interaction.customId === "create_ticket") {
        let category = interaction.guild.channels.cache.find(c => c.type === 4 && c.name === TICKET_CATEGORY_NAME);
        if (!category) {
            category = await interaction.guild.channels.create({
                name: TICKET_CATEGORY_NAME,
                type: 4
            });
        }

        const existing = interaction.guild.channels.cache.find(c => c.topic === `ticketOwner:${interaction.user.id}`);
        if (existing) return interaction.reply({ content: `⚠️ 你已經有開啟中的工單：${existing}`, ephemeral: true });

        const everyoneRole = interaction.guild.roles.everyone;
        const supportRole = config.supportRole ? interaction.guild.roles.cache.get(config.supportRole) : null;

        const permissionOverwrites = [
            { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ];
        if (supportRole) permissionOverwrites.push({ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

        const channel = await interaction.guild.channels.create({
            name: `工單-${interaction.user.username}`,
            type: 0,
            topic: `ticketOwner:${interaction.user.id}`,
            parent: category.id,
            permissionOverwrites
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claim_ticket").setLabel("🧾 接手工單").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        const welcomeMsg = config.welcomeMessage || "📩 您的票口已開啟";
        // 修復：Ping 必須在 Embed 之外才有效
        const mentions = [];
        mentions.push(`<@${interaction.user.id}>`);
        if (config.notifyRole) mentions.push(`<@&${config.notifyRole}>`);
        if (config.supportRole && config.supportRole !== config.notifyRole) mentions.push(`<@&${config.supportRole}>`);

        await channel.send({ 
            content: `${mentions.join(" ")}\n${welcomeMsg}`, 
            components: [row] 
        });
        await interaction.reply({ content: `✅ 工單已建立：${channel}`, ephemeral: true });
    }

    // 接手工單
    if (interaction.customId === "claim_ticket") {
        const member = interaction.member;
        const isSupport = config.supportRole ? member.roles.cache.has(config.supportRole) : false;
        const isAdmin = member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isSupport && !isAdmin) return interaction.reply({ content: "❌ 只有支援人員可接手。", ephemeral: true });

        const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claimed").setLabel("🧾 已接手").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        await interaction.update({
            content: `📩 此工單已由 ${member} 接手處理。`,
            components: [newRow]
        });

        const newName = interaction.channel.name.includes("處理中") ? interaction.channel.name : `${interaction.channel.name}-處理中`;
        await interaction.channel.setName(newName).catch(() => {});
    }

    // 關閉工單確認
    if (interaction.customId === "close_ticket") {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("confirm_close").setLabel("✅ 確定關閉").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("cancel_close").setLabel("❌ 取消").setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ content: "⚠️ 確定要關閉並保存紀錄嗎？", components: [confirmRow], ephemeral: true });
    }

    if (interaction.customId === "cancel_close") {
        return interaction.update({ content: "✅ 已取消關閉。", components: [] });
    }

    // 確認關閉並儲存
    if (interaction.customId === "confirm_close") {
        // 重要：延遲回應，防止訊息過多導致 3 秒逾時
        await interaction.update({ content: "📝 正在產生紀錄檔，請稍候...", components: [] });

        try {
            const messages = await fetchAllMessages(interaction.channel);
            const logs = messages.map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content || (m.attachments.size > 0 ? "[附件]" : "[無內容]")}`).join("\n");

            const logDir = path.join(__dirname, "logs");
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

            const safeName = interaction.channel.name.replace(/[\\/:*?"<>|]/g, "_");
            const filePath = path.join(logDir, `${safeName}.txt`);
            fs.writeFileSync(filePath, logs, "utf8");

            const logChannel = config.logChannel ? await interaction.guild.channels.fetch(config.logChannel).catch(() => null) : null;
            if (logChannel) {
                const attachment = new AttachmentBuilder(filePath);
                await logChannel.send({
                    content: `🗂️ 工單 **${interaction.channel.name}** 已關閉\n執行者：${interaction.user}`,
                    files: [attachment]
                });
            }

            await interaction.followUp({ content: "✅ 紀錄已保存，頻道即將刪除。", ephemeral: true });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        } catch (err) {
            console.error(err);
            await interaction.followUp({ content: "❌ 儲存失敗，請檢查權限或後台日誌。", ephemeral: true });
        }
    }
});

module.exports = client;
client.login(process.env.DISCORD_TOKEN);
