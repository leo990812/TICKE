const { 
    Client, GatewayIntentBits, Partials,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits
} = require("discord.js");
const fs = require("fs");
const config = require("./config.json");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.once("ready", () => {
    console.log(`✅ 已登入為 ${client.user.tag}`);
});

// === 開啟、接手、關閉 ===
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // 開啟工單
    if (interaction.customId === "open_ticket") {
        const existing = interaction.guild.channels.cache.find(ch => ch.topic === `ticketOwner:${interaction.user.id}`);
        if (existing) {
            return interaction.reply({ content: `⚠️ 你已經有開啟中的工單：${existing}`, ephemeral: true });
        }

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0,
            topic: `ticketOwner:${interaction.user.id}`,
            parent: config.ticketCategory,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: config.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claim_ticket").setLabel("🧾 接手工單").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: `📩 ${interaction.user} 的工單已建立，支援人員可點擊「接手」開始處理。`,
            components: [row]
        });

        await interaction.reply({ content: `✅ 工單已建立：${channel}`, ephemeral: true });
    }

    // 接手工單
    if (interaction.customId === "claim_ticket") {
        const member = interaction.member;
        const isSupport = member.roles.cache.has(config.supportRole);
        const isAdmin = member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isSupport && !isAdmin) {
            return interaction.reply({ content: "❌ 只有支援人員或管理員可接手工單。", ephemeral: true });
        }

        const msg = await interaction.channel.messages.fetch(interaction.message.id);
        const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claim_ticket").setLabel("🧾 已接手").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        await msg.edit({
            content: `📩 此工單已由 ${member} 接手，請耐心等候處理。`,
            components: [newRow]
        });

        await interaction.reply({ content: `✅ 你已接手此工單。`, ephemeral: true });
    }

    // 關閉工單
    if (interaction.customId === "close_ticket") {
        const topic = interaction.channel.topic;
        const ticketOwner = topic?.startsWith("ticketOwner:") ? topic.split(":")[1] : null;

        const isTicketOwner = interaction.user.id === ticketOwner;
        const isSupport = interaction.member.roles.cache.has(config.supportRole);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isTicketOwner && !isSupport && !isAdmin) {
            return interaction.reply({ content: "❌ 只有開啟者、支援人員或管理員可關閉工單。", ephemeral: true });
        }

        // 保存紀錄
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const logs = messages
            .reverse()
            .map(m => `[${m.author.tag}] ${m.content}`)
            .join("\n");

        const fileName = `ticket_${interaction.channel.name}.txt`;
        fs.writeFileSync(fileName, logs);

        const logChannel = interaction.guild.channels.cache.get(config.logChannel);
        if (logChannel) {
            await logChannel.send({
                content: `🗂️ 工單 ${interaction.channel.name} 已關閉，由 ${interaction.user} 關閉。`,
                files: [fileName]
            });
        }

        fs.unlinkSync(fileName); // 清理暫存檔

        await interaction.channel.send(`🔒 工單已關閉，頻道將在 3 秒後刪除。`);
        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 3000);
    }
});

client.login(config.token);
