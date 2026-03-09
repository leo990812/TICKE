require("dotenv").config();
const {
    Client, GatewayIntentBits, Partials,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, AttachmentBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const settingsDB = require("./settingsDB");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

const TICKET_CATEGORY_NAME = "🎫票口 Ticket";

// 獲取所有訊息 (修正抓取邏輯)
async function fetchAllMessages(channel) {
    let messages = [];
    let lastId;
    try {
        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            const fetched = await channel.messages.fetch(options);
            if (fetched.size === 0) break;
            messages = messages.concat(Array.from(fetched.values()));
            if (fetched.size < 100) break;
            lastId = fetched.last().id;
        }
    } catch (e) {
        console.error("抓取訊息失敗:", e);
    }
    return messages.reverse();
}

client.once("ready", () => console.log(`✅ Bot 已登入 ${client.user.tag}`));

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const guildId = interaction.guild.id;
    // 確保 config 永遠是最新的
    const config = settingsDB[guildId] || {};

    // --- 建立工單 ---
    if (interaction.customId === "create_ticket") {
        let category = interaction.guild.channels.cache.find(c => c.type === 4 && c.name === TICKET_CATEGORY_NAME);
        if (!category) {
            category = await interaction.guild.channels.create({ name: TICKET_CATEGORY_NAME, type: 4 });
        }

        const existing = interaction.guild.channels.cache.find(c => c.topic === `ticketOwner:${interaction.user.id}`);
        if (existing) return interaction.reply({ content: `⚠️ 你已經有開啟中的工單：${existing}`, ephemeral: true });

        const supportRole = config.supportRole ? interaction.guild.roles.cache.get(config.supportRole) : null;

        const channel = await interaction.guild.channels.create({
            name: `工單-${interaction.user.username}`,
            type: 0,
            topic: `ticketOwner:${interaction.user.id}`,
            parent: category.id,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                ...(supportRole ? [{ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
            ]
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claim_ticket").setLabel("🧾 接手工單").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        const welcomeMsg = config.welcomeMessage || "📩 您的票口已開啟";
        await channel.send({ 
            content: `<@${interaction.user.id}>\n${welcomeMsg}${supportRole ? `\n<@&${supportRole.id}>` : ""}`, 
            components: [row] 
        });
        await interaction.reply({ content: `✅ 工單已建立：${channel}`, ephemeral: true });
    }

    // --- 確認關閉 ---
    if (interaction.customId === "confirm_close") {
        await interaction.update({ content: "📝 正在保存工單紀錄並上傳...", components: [] });
        
        const topic = interaction.channel.topic;
        const ticketOwnerId = topic?.split(":")[1];

        try {
            const messages = await fetchAllMessages(interaction.channel);
            const logs = messages.map(m => `[${m.createdAt.toLocaleString('zh-TW')}] ${m.author.tag}: ${m.content || (m.attachments.size > 0 ? "[附件]" : "[無內容]")}`).join("\n");

            const logDir = path.join(__dirname, "logs");
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
            const filePath = path.join(logDir, `${interaction.channel.name}.txt`);
            fs.writeFileSync(filePath, logs);

            const attachment = new AttachmentBuilder(filePath);
            
            // 讀取紀錄頻道
            const logChannelId = config.logChannel;
            const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;

            if (logChannel) {
                await logChannel.send({
                    content: `🗂️ 工單 **${interaction.channel.name}** 結案報告\n**關閉者：** ${interaction.user}\n**擁有者：** ${ticketOwnerId ? `<@${ticketOwnerId}>` : "未知"}`,
                    files: [attachment]
                });
            } else {
                console.error("找不到紀錄頻道，ID:", logChannelId);
            }

            await interaction.followUp({ content: "✅ 紀錄已成功保存，頻道將在 3 秒後刪除。", ephemeral: true });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        } catch (err) {
            console.error("保存失敗:", err);
            await interaction.followUp({ content: "❌ 紀錄發送失敗，請檢查機器人權限。頻道仍會刪除。", ephemeral: true });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        }
    }

    // (其餘互動邏輯保持不變...)
    if (interaction.customId === "claim_ticket") {
        const member = interaction.member;
        const isSupport = config.supportRole ? member.roles.cache.has(config.supportRole) : false;
        if (!isSupport && !member.permissions.has(PermissionFlagsBits.ManageChannels)) 
            return interaction.reply({ content: "❌ 權限不足。", ephemeral: true });
        
        await interaction.channel.setName(`處理中-${interaction.channel.name}`);
        await interaction.reply({ content: `✅ ${member} 已接手。` });
    }
    if (interaction.customId === "close_ticket") {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("confirm_close").setLabel("✅ 確定").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("cancel_close").setLabel("❌ 取消").setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: "確定要關閉嗎？", components: [confirmRow], ephemeral: true });
    }
    if (interaction.customId === "cancel_close") await interaction.update({ content: "已取消。", components: [] });
});

module.exports = client;
client.login(process.env.DISCORD_TOKEN);
