// bot.js
require("dotenv").config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, roleMention, userMention } = require("discord.js");
const settingsDB = require("./settingsDB");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel]
});

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const TICKET_CATEGORY_NAME = "🎫票口 Ticket";

client.once("ready", () => {
    console.log(`✅ Bot 已登入 ${client.user.tag}`);

    // 啟動時自動發送按鈕訊息
    for (const guildId in settingsDB) {
        const config = settingsDB[guildId];
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(config.ticketChannel);
        if (!channel) continue;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel("🎫 開啟工單")
                .setStyle(ButtonStyle.Primary)
        );

        channel.send({
            content: `📢 ${roleMention(config.notifyRole)}\n**自創工單機器人**\n用途：提交建議、提出疑問\n⚠️ 若遇問題請聯繫 ${userMention(ADMIN_USER_ID)}`,
            components: [row]
        });
    }
});

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isButton()) {
            const config = settingsDB[interaction.guild.id];
            if (!config) return interaction.reply({ content: "⚠️ 此伺服器還沒設定工單系統！", ephemeral: true });

            // 開啟工單
            if (interaction.customId === "create_ticket") {
                let category = interaction.guild.channels.cache.find(c => c.type === 4 && c.name === TICKET_CATEGORY_NAME);
                if (!category) category = await interaction.guild.channels.create({ name: TICKET_CATEGORY_NAME, type: 4 });

                const channel = await interaction.guild.channels.create({
                    name: `工單-${interaction.user.username}`,
                    type: 0,
                    parent: category.id,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: config.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ 關閉工單").setStyle(ButtonStyle.Danger)
                );

                await channel.send({ content: `👋 ${interaction.user}，這裡是你的工單，請描述問題！`, components: [closeRow] });
                await interaction.reply({ content: `✅ 工單已建立：${channel}`, ephemeral: true });
            }

            // 關閉工單
            if (interaction.customId === "close_ticket") {
                // 只有支援角色或建立者可關閉
                if (interaction.member.roles.cache.has(config.supportRole) || interaction.user.id === interaction.channel.permissionOverwrites.cache.find(o => o.type === "member" && o.allow.has(PermissionFlagsBits.ViewChannel))?.id) {
                    await interaction.channel.delete();
                } else {
                    await interaction.reply({ content: "❌ 你沒有權限關閉工單", ephemeral: true });
                }
            }
        }
    } catch (err) {
        console.error("❌ 工單互動錯誤：", err);
    }
});

client.login(process.env.DISCORD_TOKEN);
