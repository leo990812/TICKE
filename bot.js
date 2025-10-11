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

client.once("ready", () => {
    console.log(`✅ Bot 已登入 ${client.user.tag}`);
});

// 抓取所有訊息（用於保存紀錄）
async function fetchAllMessages(channel) {
    let messages = [];
    let lastId;
    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetched = await channel.messages.fetch(options);
        messages = messages.concat(Array.from(fetched.values()));
        if (fetched.size !== 100) break;
        lastId = fetched.last()?.id;
    }
    return messages.reverse();
}

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const config = settingsDB[interaction.guild.id];
    if (!config) return interaction.reply({ content: "⚠️ 此伺服器尚未設定工單系統！", ephemeral: true });

    // === 開啟工單 ===
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
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ];
        if (supportRole) permissionOverwrites.push({ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

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

        const welcomeMsg = config.welcomeMessage?.trim() || "您的票口已開啟";
        const userMention = `<@${interaction.user.id}>`;
        const supportMention = supportRole ? `<@&${supportRole.id}>` : "";
        const messageContent = `${userMention}\n${welcomeMsg}\n${supportMention}`;

        await channel.send({ content: messageContent, components: [row] });
        await interaction.reply({ content: `✅ 工單已建立：${channel}`, ephemeral: true });
    }

    // === 接手工單 ===
    if (interaction.customId === "claim_ticket") {
        const member = interaction.member;
        const isSupport = config.supportRole ? member.roles.cache.has(config.supportRole) : false;
        const isAdmin = member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isSupport && !isAdmin)
            return interaction.reply({ content: "❌ 只有支援人員或管理員可接手工單。", ephemeral: true });

        const msg = await interaction.channel.messages.fetch(interaction.message.id);
        const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claim_ticket").setLabel("🧾 已接手").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        await msg.edit({
            content: `📩 此工單已由 ${member} 接手，請耐心等候處理。`,
            components: [newRow]
        });

        await interaction.channel.setName(`工單-${interaction.channel.name.replace("工單-", "")}-處理中`);
        await interaction.reply({ content: `✅ 你已接手此工單。`, ephemeral: true });
    }

    // === 關閉確認 ===
    if (interaction.customId === "close_ticket") {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("confirm_close").setLabel("✅ 確定關閉").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("cancel_close").setLabel("❌ 取消").setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
            content: "⚠️ 你確定要關閉這張工單嗎？此操作將保存紀錄並刪除此頻道。",
            components: [confirmRow],
            ephemeral: true
        });
    }

    if (interaction.customId === "cancel_close") {
        return interaction.update({ content: "✅ 已取消關閉操作。", components: [] });
    }

    if (interaction.customId === "confirm_close") {
        await interaction.update({ content: "📝 正在保存工單紀錄...", components: [] });

        const topic = interaction.channel.topic;
        const ticketOwner = topic?.startsWith("ticketOwner:") ? topic.split(":")[1] : null;

        const isTicketOwner = interaction.user.id === ticketOwner;
        const member = interaction.member;
        const isSupport = config.supportRole ? member.roles.cache.has(config.supportRole) : false;
        const isAdmin = member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isTicketOwner && !isSupport && !isAdmin)
            return interaction.followUp({ content: "❌ 你沒有權限關閉此工單。", ephemeral: true });

        try {
            const messages = await fetchAllMessages(interaction.channel);
            const logs = messages.map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content || "(附件/無內容)"}`).join("\n");

            const logDir = path.join(__dirname, "logs");
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

            const filePath = path.join(logDir, `${interaction.channel.name}.txt`);
            fs.writeFileSync(filePath, logs);

            const attachment = new AttachmentBuilder(filePath);
            const logChannel = config.logChannel ? interaction.guild.channels.cache.get(config.logChannel) : null;

            if (logChannel) {
                await logChannel.send({
                    content: `🗂️ 工單 **${interaction.channel.name}** 已關閉，由 ${interaction.user} 關閉。`,
                    files: [attachment]
                });
            }

            await interaction.followUp({ content: "✅ 工單紀錄已保存並上傳，頻道將在 3 秒後刪除。", ephemeral: true });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);

        } catch (err) {
            console.error("❌ 保存紀錄錯誤：", err);
            await interaction.followUp({ content: "⚠️ 無法保存紀錄，請查看主控台錯誤。", ephemeral: true });
        }
    }
});

module.exports = client;
client.login(process.env.DISCORD_TOKEN);
